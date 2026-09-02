-- Clear old signals (keep config history)
DELETE FROM signals WHERE created_at < now();
DELETE FROM telegram_notifications WHERE created_at < now();

SELECT COUNT(*) as signals_remaining FROM signals;
