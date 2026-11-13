from datetime import datetime, timedelta
from decimal import Decimal
import uuid

import pytest

from app.db import SessionLocal
from app.models import AdminRole, AdminUser, AnnualMembershipTerm, CardBatch, EmailOutbox, Member, MemberAccount, MemberPayment, MemberStatus, MembershipPayment, OperationLog, OrgAdminToken, Organization, TemporaryMembershipPurchase
from app.utils import hash_token


@pytest.fixture
def data():
    with SessionLocal() as db:
        suffix = uuid.uuid4().hex[:10]
        now = datetime.utcnow()
        org = Organization(name='Correction '+suffix, slug='correction-'+suffix, is_active=True, custom_membership_types_enabled=False)
        db.add(org)
        db.flush()
        admin = AdminUser(email='correction-admin-'+suffix+'@example.test', role=AdminRole.ORG_ADMIN, org_id=org.id, is_active=True)
        account = MemberAccount(email='correction-'+suffix+'@example.test', password_hash='existing-credential', auth_version=7)
        batch = CardBatch(org_id=org.id, year=now.year, start_no=780001, end_no=780100, next_no=780002)
        db.add_all([admin, account, batch])
        db.flush()
        member = Member(org_id=org.id, account_id=account.id, first_name='Synthetic', last_name='Correction',
            email=None, fiscal_code=None, status=MemberStatus.ACTIVE, membership_type='temporary',
            card_no=780001, card_year=now.year, batch_id=batch.id, card_namespace='paper_exception',
            joined_at=now-timedelta(days=4), valid_from=now-timedelta(days=4), valid_until=now-timedelta(days=3),
            membership_fee_snapshot=Decimal('12.50'), decision_at=now-timedelta(days=4),
            card_is_paid=True, card_payment_status='paid', auth_version=4)
        db.add(member)
        db.flush()
        payment = MemberPayment(member_id=member.id, org_id=org.id, admin_id=admin.id, amount_cents=1250, method='cash', paid_at=now-timedelta(days=4))
        history = TemporaryMembershipPurchase(member_id=member.id, org_id=org.id, status='expired', method='legacy',
            amount=Decimal('12.50'), card_no=780001, card_year=now.year, valid_from=member.valid_from, valid_until=member.valid_until)
        db.add_all([payment, history])
        db.commit()
        yield db, org, admin, member, account, batch, payment, history


def login(client, db, admin, scope):
    client.cookies.clear()
    if scope == 'super-admin':
        response = client.post('/api/super-admin/auth/login', json={'email':'admin@assonam.it','password':'admin'})
        assert response.status_code == 200, response.text
    else:
        token = uuid.uuid4().hex
        db.add(OrgAdminToken(admin_id=admin.id, token_hash=hash_token(token), expires_at=datetime.utcnow()+timedelta(minutes=15)))
        db.commit()
        assert client.get('/api/org-admin/auth/verify', params={'token':token}, follow_redirects=False).status_code == 302


def correct(client, scope, member):
    return client.patch(f'/api/{scope}/members/{member.id}/membership-type', json={'membership_type':'annual'})


@pytest.mark.parametrize('scope', ['org-admin', 'super-admin'])
def test_correction_keeps_issued_identity_account_payment_stock_and_history(client, data, scope):
    db, org, admin, member, account, batch, payment, history = data
    before = (member.card_no, member.card_year, member.card_namespace, member.batch_id, member.account_id, member.auth_version,
        member.valid_from, member.joined_at, member.membership_fee_snapshot, member.card_is_paid, member.card_payment_status,
        batch.next_no, payment.amount_cents, history.valid_until, account.password_hash, account.auth_version)
    login(client, db, admin, scope)
    response = correct(client, scope, member)
    assert response.status_code == 200, response.text
    assert response.json()['membership_type'] == 'annual' and response.json()['is_active']
    assert response.json()['can_correct_membership_type'] is False
    for row in (member, account, batch, payment, history): db.refresh(row)
    assert before == (member.card_no, member.card_year, member.card_namespace, member.batch_id, member.account_id, member.auth_version,
        member.valid_from, member.joined_at, member.membership_fee_snapshot, member.card_is_paid, member.card_payment_status,
        batch.next_no, payment.amount_cents, history.valid_until, account.password_hash, account.auth_version)
    assert member.valid_until is None
    term = db.query(AnnualMembershipTerm).filter_by(member_id=member.id).one()
    assert (term.card_no, term.card_year, term.card_namespace, term.fee_amount) == (member.card_no, member.card_year, 'paper_exception', Decimal('12.50'))
    assert db.query(MemberPayment).filter_by(member_id=member.id).count() == 1
    assert db.query(MembershipPayment).filter_by(socio_id=member.id).count() == 0
    assert db.query(EmailOutbox).count() == 0
    audit = db.query(OperationLog).filter_by(entity_id=member.id, action='member.membership_type.correct').one()
    assert audit.org_id == org.id and audit.actor_role == scope.replace('-', '_')
    assert correct(client, scope, member).status_code == 200
    assert db.query(OperationLog).filter_by(entity_id=member.id, action='member.membership_type.correct').count() == 1
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 1


@pytest.mark.parametrize('scope', ['org-admin', 'super-admin'])
@pytest.mark.parametrize('status', [MemberStatus.PENDING_DOCS, MemberStatus.PENDING_VERIFICATION, MemberStatus.PENDING_CARDS])
def test_pending_correction_never_approves_or_issues(client, data, scope, status):
    db, _, admin, member, _, batch, *_ = data
    member.status, member.card_no, member.card_year, member.batch_id, member.decision_at = status, None, None, None, None
    db.commit()
    next_no = batch.next_no
    login(client, db, admin, scope)
    assert correct(client, scope, member).status_code == 200
    db.refresh(member); db.refresh(batch)
    assert member.membership_type == 'annual' and member.status == status and member.decision_at is None
    assert member.card_no is None and member.card_year is None and batch.next_no == next_no
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 0


@pytest.mark.parametrize('year_offset,expected_active', [(0, True),(-1,False),(1,False)])
def test_persisted_expiry_reactivation_respects_same_issued_year(client, data, year_offset, expected_active):
    db, _, admin, member, *_ = data
    member.status, member.expired_at = MemberStatus.EXPIRED, datetime.utcnow()-timedelta(days=1)
    member.card_year += year_offset
    db.commit()
    login(client, db, admin, 'org-admin')
    response = correct(client, 'org-admin', member)
    assert response.status_code == 200, response.text
    assert response.json()['is_active'] is expected_active
    db.refresh(member)
    assert member.status == (MemberStatus.ACTIVE if expected_active else MemberStatus.EXPIRED)


def test_future_issued_card_cannot_become_active_early_via_correction(client,data):
    db,_,admin,member,*_ = data
    member.card_year += 1
    db.commit()
    login(client,db,admin,'org-admin')
    response = correct(client,'org-admin',member)
    assert response.status_code == 409 and 'futura' in response.json()['detail']
    db.refresh(member)
    assert member.membership_type == 'temporary' and member.status == MemberStatus.ACTIVE
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 0


def test_pending_without_issued_number_keeps_future_year_and_workflow(client,data):
    db,_,admin,member,*_ = data
    member.status,member.card_no,member.decision_at = MemberStatus.PENDING_DOCS,None,None
    member.card_year += 1
    expected_year = member.card_year
    db.commit()
    login(client,db,admin,'org-admin')
    assert correct(client,'org-admin',member).status_code == 200
    db.refresh(member)
    assert member.status == MemberStatus.PENDING_DOCS and member.card_no is None and member.card_year == expected_year
    assert db.query(AnnualMembershipTerm).filter_by(member_id=member.id).count() == 0


@pytest.mark.parametrize('kind', ['checkout','held_failed','temporary','renewal','conflicting_term','expired_without_approval'])
def test_open_financial_flows_and_conflicting_history_block_correction(client, data, kind):
    db, org, admin, member, *_ = data
    if kind in ('checkout','held_failed'):
        db.add(MembershipPayment(org_id=org.id, socio_id=member.id, amount=12.5, status='pending' if kind=='checkout' else 'failed', source='sumup', reservation_state='held' if kind=='held_failed' else None, reserved_card_no=member.card_no+1 if kind=='held_failed' else None, reserved_card_year=member.card_year if kind=='held_failed' else None))
    elif kind == 'temporary':
        db.add(TemporaryMembershipPurchase(org_id=org.id, member_id=member.id, status='manual_pending', method='contanti', amount=12.5))
    elif kind in ('renewal','conflicting_term'):
        db.add(AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=member.card_year,
            starts_on=datetime.utcnow().date(), valid_through=datetime(member.card_year+1,1,1).date(),
            status='due' if kind=='renewal' else 'cancelled', card_no=None if kind=='renewal' else member.card_no+1,
            card_year=member.card_year, card_namespace='paper_exception'))
    else:
        member.status, member.decision_at = MemberStatus.EXPIRED, None
    db.commit()
    login(client, db, admin, 'org-admin')
    response = correct(client, 'org-admin', member)
    assert response.status_code == 409, response.text
    db.refresh(member)
    assert member.membership_type == 'temporary'
    assert db.query(OperationLog).filter_by(entity_id=member.id, action='member.membership_type.correct').count() == 0


def test_terminal_failed_attempt_does_not_block_and_prior_history_stays_unchanged(client, data):
    db, org, admin, member, *_ = data
    payment = MembershipPayment(org_id=org.id, socio_id=member.id, amount=12.5, status='failed', source='sumup', reservation_state='released')
    term = AnnualMembershipTerm(org_id=org.id, member_id=member.id, membership_year=member.card_year-1,
        starts_on=datetime(member.card_year-1,1,1).date(), valid_through=datetime(member.card_year,1,1).date(),
        status='expired', card_no=779999, card_year=member.card_year-1, card_namespace='digital', fee_amount=20)
    db.add_all([payment,term]); db.commit()
    login(client, db, admin, 'super-admin')
    assert correct(client, 'super-admin', member).status_code == 200
    db.refresh(payment); db.refresh(term)
    assert payment.status == 'failed' and payment.reservation_state == 'released'
    assert term.status == 'expired' and term.card_no == 779999 and term.fee_amount == 20


@pytest.mark.parametrize('scope', ['org-admin','super-admin'])
@pytest.mark.parametrize('blocked', ['rejected','deleted'])
def test_rejected_and_deleted_never_reactivate(client, data, scope, blocked):
    db, _, admin, member, *_ = data
    if blocked == 'rejected': member.status = MemberStatus.REJECTED
    else: member.deleted_at = datetime.utcnow()
    db.commit()
    login(client, db, admin, scope)
    response = correct(client, scope, member)
    assert response.status_code == (404 if blocked=='deleted' else 409)
    db.refresh(member)
    assert member.membership_type == 'temporary'


def test_org_scope_and_body_disallow_other_tenant_downgrade_and_unrelated_fields(client, data):
    db, _, admin, member, *_ = data
    client.cookies.clear()
    assert correct(client, 'org-admin', member).status_code == 401
    login(client, db, admin, 'org-admin')
    other = Organization(name='Other',slug='other-'+uuid.uuid4().hex,is_active=True)
    db.add(other); db.flush()
    foreign = Member(org_id=other.id,first_name='Other',last_name='Tenant',membership_type='temporary',status=MemberStatus.PENDING_DOCS)
    db.add(foreign); db.commit()
    assert correct(client,'org-admin',foreign).status_code == 404
    for payload in ({'membership_type':'temporary'},{'membership_type':'annual','first_name':'Rewrite'}):
        assert client.patch(f'/api/org-admin/members/{member.id}/membership-type',json=payload).status_code == 422


@pytest.mark.parametrize('blocked', [False, True])
def test_profile_type_change_preserves_explicit_identity_and_fee_edits_or_rolls_back(client, data, blocked):
    db, org, admin, member, *_ = data
    if blocked:
        db.add(MembershipPayment(org_id=org.id,socio_id=member.id,amount=12.5,status='pending',source='sumup'))
        db.commit()
    login(client, db, admin, 'org-admin')
    response = client.patch(f'/api/org-admin/members/{member.id}/profile',json={
        'first_name':'Corrected','last_name':'Name','internal_notes':'Explicit update','membership_type':'annual','membership_fee_snapshot':19.5,
    })
    assert response.status_code == (409 if blocked else 200), response.text
    db.refresh(member)
    assert (member.first_name,member.last_name,member.internal_notes,member.membership_type,member.membership_fee_snapshot) == (
        ('Synthetic','Correction',None,'temporary',Decimal('12.50')) if blocked
        else ('Corrected','Name','Explicit update','annual',Decimal('19.50')))


def test_existing_matching_annual_term_keeps_economic_and_issuance_history(client, data):
    db, org, admin, member, *_ = data
    term = AnnualMembershipTerm(org_id=org.id,member_id=member.id,membership_year=member.card_year,
        starts_on=datetime(member.card_year,1,1).date(),valid_through=datetime(member.card_year+1,1,1).date(),
        status='cancelled',card_no=member.card_no,card_year=member.card_year,card_namespace=member.card_namespace,
        fee_amount=Decimal('30.00'),currency='USD',source='historical-original')
    db.add(term);db.commit()
    login(client,db,admin,'org-admin')
    assert correct(client,'org-admin',member).status_code == 200
    db.refresh(term)
    assert (term.fee_amount,term.currency,term.source,term.starts_on,term.batch_id) == (Decimal('30.00'),'USD','historical-original',datetime(member.card_year,1,1).date(),None)
    assert term.status == 'active'


@pytest.mark.parametrize('legacy', [False, True])
def test_wallet_correction_preserves_current_object_id_and_older_temporary_passes(client,data,monkeypatch,legacy):
    from sqlalchemy import update
    from app.models_wallet import GoogleWalletPass
    from app.services import google_wallet_sync as wallet
    from app.services.card_verification import build_card_verification_token
    monkeypatch.setenv('GOOGLE_WALLET_ISSUER_ID','123456')
    db,org,admin,member,_,_,_,history = data
    member.card_namespace = 'digital'
    db.commit()
    current_id = f'123456.{org.slug}.{member.id}.tmp.{history.id}'
    old_purchase = TemporaryMembershipPurchase(member_id=member.id,org_id=org.id,status='expired',method='legacy',amount=10,
        card_no=member.card_no-1,card_year=member.card_year,valid_until=member.valid_from-timedelta(days=1))
    db.add(old_purchase);db.flush()
    old_pass = GoogleWalletPass(member_id=member.id,org_id=org.id,class_id='123456.qa',object_id=current_id+'.old',kind='temporary',temporary_purchase_id=old_purchase.id)
    db.add(old_pass)
    if not legacy:
        db.add(GoogleWalletPass(member_id=member.id,org_id=org.id,class_id='123456.qa',object_id=current_id,kind='temporary',temporary_purchase_id=history.id))
    db.commit()
    db.execute(update(Member).where(Member.id==member.id).values(google_wallet_object_id=current_id,google_wallet_class_id='123456.qa'))
    db.commit();db.expire(member)
    login(client,db,admin,'super-admin')
    response = correct(client,'super-admin',member)
    assert response.status_code == 200,response.text
    db.expire_all()
    current = db.query(GoogleWalletPass).filter_by(object_id=current_id).one()
    assert current.kind == 'annual' and current.temporary_purchase_id is None
    assert wallet.wallet_identity(member)[1] == current_id
    payload,_ = wallet._payload_for_pass(db,current)
    assert payload['id'] == current_id and 'Annuale' in str(payload)
    assert payload['state'] == 'ACTIVE'
    assert old_pass.kind == 'temporary' and old_pass.temporary_purchase_id == old_purchase.id
    assert db.get(TemporaryMembershipPurchase,history.id).status == 'expired'
    proof = build_card_verification_token(member_id=member.id,org_id=org.id,card_number=member.card_no,card_year=member.card_year)
    assert proof in payload['barcode']['value']


@pytest.mark.parametrize('card_namespace', ['digital','paper_exception'])
def test_wallet_stale_pointer_never_converts_an_older_or_different_namespace_pass(client,data,monkeypatch,card_namespace):
    from sqlalchemy import update
    from app.models_wallet import GoogleWalletPass
    from app.services.card_verification import build_card_verification_token
    monkeypatch.setenv('GOOGLE_WALLET_ISSUER_ID','123456')
    db,org,admin,member,*_ = data
    member.card_namespace=card_namespace
    db.commit()
    old_number = member.card_no-1 if card_namespace=='digital' else member.card_no
    old_proof = build_card_verification_token(member_id=member.id,org_id=org.id,card_number=old_number,card_year=member.card_year)
    old_object=f'123456.qa.{member.id}.tmp.legacy.{member.card_year}.{old_number}'
    old_pass=GoogleWalletPass(member_id=member.id,org_id=org.id,class_id='123456.qa',object_id=old_object,kind='temporary',
        payload_json={'barcode':{'value':'https://example.test/api/cards/verify/'+old_proof},'state':'EXPIRED'})
    db.add(old_pass);db.commit()
    db.execute(update(Member).where(Member.id==member.id).values(google_wallet_object_id=old_object,google_wallet_class_id='123456.qa'))
    db.commit();db.expire(member)
    login(client,db,admin,'org-admin')
    response=correct(client,'org-admin',member)
    assert response.status_code==200,response.text
    db.refresh(old_pass)
    assert old_pass.kind=='temporary' and old_pass.temporary_purchase_id is None
    assert old_pass.payload_json['barcode']['value'].endswith(old_proof)
