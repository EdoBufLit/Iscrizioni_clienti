TASK 4 completato (verifica flusso prenotazioni):
- le prenotazioni si salvano su `bookings` solo se il form ha `booking_enabled = true`.
- finiscono in agenda automaticamente (come confermate o pending a seconda di `booking_requires_manual_confirmation`).
- NON si riflettono automaticamente in mappe o sale: è sempre necessaria l'assegnazione manuale da parte dell'admin.

TASK 5: Ora implemento l'inserimento manuale in `OrgAdminBookings.tsx`.
