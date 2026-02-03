"""
Tests for card number assignment logic.

Verifies:
1. Sequential assignment within a batch (500, 501, 502, ...)
2. Automatic progression to next batch when current is exhausted
3. Error when all batches are exhausted
4. No duplicate card numbers in concurrent scenarios
"""

import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.services.card import assign_next_card
from app.models import CardBatch, Member


class MockBatch:
    """Mock CardBatch for testing."""
    def __init__(self, id, org_id, start_no, end_no, next_no=None):
        self.id = id
        self.org_id = org_id
        self.start_no = start_no
        self.end_no = end_no
        self.next_no = next_no


class TestCardAssignment:
    """Test card number assignment logic."""

    def test_assigns_first_number_from_fresh_batch(self):
        """Fresh batch (next_no=None) should start from start_no."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=None)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        assert result == 500
        assert batch.next_no == 501

    def test_assigns_sequential_numbers(self):
        """Should assign numbers sequentially within a batch."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=505)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        assert result == 505
        assert batch.next_no == 506

    def test_skips_exhausted_batch_to_next(self):
        """When first batch is exhausted, should use next available batch."""
        # Batch 1: exhausted (next_no > end_no)
        batch1 = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=801)
        # Batch 2: has capacity
        batch2 = MockBatch(id=2, org_id=1, start_no=2000, end_no=2200, next_no=2000)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1, batch2]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        # Should skip batch1 (exhausted) and use batch2
        assert result == 2000
        assert batch2.next_no == 2001
        # batch1 should be unchanged
        assert batch1.next_no == 801

    def test_assigns_last_number_in_batch(self):
        """Should be able to assign the last number in a batch."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=502, next_no=502)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        assert result == 502
        assert batch.next_no == 503  # Now exhausted

    def test_error_when_all_batches_exhausted(self):
        """Should raise error when all batches are exhausted."""
        batch1 = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=801)
        batch2 = MockBatch(id=2, org_id=1, start_no=2000, end_no=2200, next_no=2201)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1, batch2]

        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 409
        assert "esauriti" in exc_info.value.detail.lower()

    def test_error_when_no_batches(self):
        """Should raise error when no batches exist for org."""
        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = []

        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 409
        assert "nessun lotto" in exc_info.value.detail.lower()

    def test_error_on_duplicate_card_number(self):
        """Should raise error if card number is already assigned."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=505)

        # Mock existing member with same card number
        existing_member = MagicMock(spec=Member)
        existing_member.id = 99
        existing_member.card_no = 505

        mock_db = MagicMock(spec=Session)
        # First call returns batches, second call returns existing member
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = existing_member

        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 500
        assert "conflitto" in exc_info.value.detail.lower()

    def test_batches_ordered_by_start_no(self):
        """Batches should be processed in order of start_no."""
        # Batch with higher start_no listed first (wrong order in input)
        batch_high = MockBatch(id=2, org_id=1, start_no=2000, end_no=2200, next_no=2000)
        batch_low = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=500)

        mock_db = MagicMock(spec=Session)
        # Simulating that the query returns them in correct order (by start_no)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch_low, batch_high]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        # Should use batch_low first (lower start_no)
        assert result == 500
        assert batch_low.next_no == 501

    def test_fresh_batch_after_exhausted(self):
        """Fresh batch (next_no=None) after exhausted batch should work."""
        batch1 = MockBatch(id=1, org_id=1, start_no=500, end_no=502, next_no=503)  # Exhausted
        batch2 = MockBatch(id=2, org_id=1, start_no=2000, end_no=2200, next_no=None)  # Fresh

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1, batch2]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        result = assign_next_card(mock_db, org_id=1)

        assert result == 2000
        assert batch2.next_no == 2001


class TestConcurrentAssignment:
    """Test concurrent card assignment scenarios."""

    def test_sequential_assignments_no_duplicates(self):
        """Multiple sequential assignments should not produce duplicates."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=800, next_no=500)

        assigned_cards = []

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        # Simulate 5 sequential assignments
        for _ in range(5):
            result = assign_next_card(mock_db, org_id=1)
            assigned_cards.append(result)

        # All should be unique
        assert len(assigned_cards) == len(set(assigned_cards))
        assert assigned_cards == [500, 501, 502, 503, 504]
        assert batch.next_no == 505


class TestExhaustedBatchesPolicy:
    """Test the policy when all batches are exhausted (PENDING_CARDS scenario)."""

    def test_exhausted_raises_409_error(self):
        """Exhausted batches should raise 409 HTTPException."""
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=502, next_no=503)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]

        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 409
        # Callers can catch this 409 and set member to PENDING_CARDS

    def test_no_card_assigned_when_exhausted(self):
        """No card number should be returned when batches exhausted."""
        batch1 = MockBatch(id=1, org_id=1, start_no=500, end_no=500, next_no=501)
        batch2 = MockBatch(id=2, org_id=1, start_no=600, end_no=600, next_no=601)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1, batch2]

        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 409
        # Both batches remain unchanged
        assert batch1.next_no == 501
        assert batch2.next_no == 601

    def test_no_number_outside_range_ever_assigned(self):
        """Numbers outside defined ranges should never be assigned."""
        # Batch with only one card left
        batch = MockBatch(id=1, org_id=1, start_no=500, end_no=500, next_no=500)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        # First assignment should work
        result = assign_next_card(mock_db, org_id=1)
        assert result == 500
        assert batch.next_no == 501

        # Second assignment should fail (batch exhausted)
        with pytest.raises(HTTPException) as exc_info:
            assign_next_card(mock_db, org_id=1)

        assert exc_info.value.status_code == 409
        # next_no is 501 but that's > end_no (500), so no card 501 is assigned

    def test_new_batch_after_exhaustion_works(self):
        """Adding a new batch after exhaustion should allow new assignments."""
        # Initially exhausted batch
        batch1 = MockBatch(id=1, org_id=1, start_no=500, end_no=500, next_no=501)

        mock_db = MagicMock(spec=Session)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1]

        # Should fail
        with pytest.raises(HTTPException):
            assign_next_card(mock_db, org_id=1)

        # Admin adds new batch
        batch2 = MockBatch(id=2, org_id=1, start_no=2000, end_no=2100, next_no=2000)
        mock_db.execute.return_value.scalars.return_value.all.return_value = [batch1, batch2]
        mock_db.execute.return_value.scalars.return_value.first.return_value = None

        # Now should work
        result = assign_next_card(mock_db, org_id=1)
        assert result == 2000
        assert batch2.next_no == 2001
