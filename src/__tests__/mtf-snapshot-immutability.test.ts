import { MTFCalculator } from '../domain/mtf-calculator';
import { Candle, CandleStatus, CandleOHLC } from '../domain/candle';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { TimeframeAvailability } from '../domain/mtf-snapshot';

function istTimeString(dateTimeStr: string): Date {
  const [date, time] = dateTimeStr.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const timeParts = time.split(':').map(Number);
  const hours = timeParts[0];
  const minutes = timeParts[1];
  const seconds = timeParts[2] || 0;

  const utcDate = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  utcDate.setUTCHours(utcDate.getUTCHours() - 5);
  utcDate.setUTCMinutes(utcDate.getUTCMinutes() - 30);

  return utcDate;
}

function createClosedCandle(
  symbol: string,
  timeframe: TimeframeValue,
  openTimeIST: string,
  closeTimeIST: string,
): Candle {
  const openUTC = istTimeString(openTimeIST);
  const closeUTC = istTimeString(closeTimeIST);

  const ohlc: CandleOHLC = { open: 100, high: 105, low: 99, close: 102, volume: 1000 };

  return new Candle(
    symbol,
    Timeframe.from(timeframe),
    openUTC,
    closeUTC,
    ohlc,
    CandleStatus.CLOSED,
    closeUTC,
  );
}

describe('MTFSnapshot Immutability', () => {
  describe('Snapshot State Persistence', () => {
    it('should not change when new candles are added to candle list after snapshot creation', () => {
      // Create initial candles at 09:40
      const candles5m_09_20 = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );
      const candles5m_09_40 = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:35:00',
        '2026-08-21T09:40:00',
      );
      const candles15m_prev = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIFTEEN_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:30:00',
      );

      const asOfTime_09_40 = istTimeString('2026-08-21T09:40:00');

      // Create snapshot at 09:40
      const snapshot_09_40 = MTFCalculator.getMTFSnapshot(
        [candles5m_09_20, candles5m_09_40, candles15m_prev],
        asOfTime_09_40,
        'RELIANCE',
      );

      // Record the state
      const candle5m_at_09_40 = snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);
      const candle15m_at_09_40 = snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.FIFTEEN_MIN);
      const candle60m_at_09_40 = snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.SIXTY_MIN);
      const avail60m_at_09_40 = snapshot_09_40.getAvailability(TimeframeValue.SIXTY_MIN);

      // Now add new candles that close after 09:40
      const candles15m_new = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIFTEEN_MIN,
        '2026-08-21T09:30:00',
        '2026-08-21T09:45:00',
      );
      const candles60m_new = createClosedCandle(
        'RELIANCE',
        TimeframeValue.SIXTY_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T10:15:00',
      );

      // Build a NEW snapshot at 10:15
      const asOfTime_10_15 = istTimeString('2026-08-21T10:15:00');
      const snapshot_10_15 = MTFCalculator.getMTFSnapshot(
        [candles5m_09_20, candles5m_09_40, candles15m_prev, candles15m_new, candles60m_new],
        asOfTime_10_15,
        'RELIANCE',
      );

      // VERIFY: The 09:40 snapshot should be unchanged
      expect(snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)).toEqual(candle5m_at_09_40);
      expect(snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.FIFTEEN_MIN)).toEqual(
        candle15m_at_09_40,
      );
      expect(snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.SIXTY_MIN)).toEqual(candle60m_at_09_40);
      expect(snapshot_09_40.getAvailability(TimeframeValue.SIXTY_MIN)).toBe(avail60m_at_09_40);

      // VERIFY: The new 10:15 snapshot has the newly available 60m candle
      expect(snapshot_10_15.getLatestConfirmedCandle(TimeframeValue.SIXTY_MIN)).toBeDefined();
      expect(snapshot_10_15.getLatestConfirmedCandle(TimeframeValue.SIXTY_MIN)).toEqual(candles60m_new);
      expect(snapshot_10_15.getAvailability(TimeframeValue.SIXTY_MIN)).toBe(TimeframeAvailability.AVAILABLE);
    });

    it('should not change when building new snapshot at later time', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime_09_20 = istTimeString('2026-08-21T09:20:00');
      const snapshot_09_20 = MTFCalculator.getMTFSnapshot([candles5m], asOfTime_09_20, 'RELIANCE');

      const state_09_20_5m = snapshot_09_20.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);

      // Build another snapshot at later time with same candle
      const asOfTime_09_40 = istTimeString('2026-08-21T09:40:00');
      const snapshot_09_40 = MTFCalculator.getMTFSnapshot([candles5m], asOfTime_09_40, 'RELIANCE');

      // Original snapshot should be unchanged
      expect(snapshot_09_20.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)).toEqual(state_09_20_5m);
      expect(snapshot_09_20.asOfTimeUTC.getTime()).toBe(asOfTime_09_20.getTime());

      // New snapshot should have same candle
      expect(snapshot_09_40.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)).toEqual(candles5m);
      expect(snapshot_09_40.asOfTimeUTC.getTime()).toBe(asOfTime_09_40.getTime());
    });
  });

  describe('Timestamp Immutability', () => {
    it('should not allow mutation of asOfTimeUTC after snapshot creation', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const originalTime = new Date(asOfTime.getTime());

      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      const snapshotTime = snapshot.asOfTimeUTC.getTime();

      // Try to mutate the original date (should not affect snapshot)
      asOfTime.setHours(asOfTime.getHours() + 1);

      // Snapshot should still have original time
      expect(snapshot.asOfTimeUTC.getTime()).toBe(snapshotTime);
      expect(snapshot.asOfTimeUTC.getTime()).toBe(originalTime.getTime());
    });

    it('should not mutate timestamp when reading it multiple times', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      const firstRead = snapshot.asOfTimeUTC.getTime();
      const secondRead = snapshot.asOfTimeUTC.getTime();
      const thirdRead = snapshot.asOfTimeUTC.getTime();

      expect(firstRead).toBe(secondRead);
      expect(secondRead).toBe(thirdRead);
    });
  });

  describe('Seal and Prevent Modification', () => {
    it('should throw error when trying to add state to sealed snapshot', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      // Should be sealed
      expect(snapshot.isSealed()).toBe(true);

      // Try to add state (should fail)
      const newState = {
        timeframe: Timeframe.from(TimeframeValue.FIFTEEN_MIN),
        latestConfirmedCandle: null,
        knowledgeTime: null,
        availability: TimeframeAvailability.UNAVAILABLE,
      };

      expect(() => snapshot.addTimeframeState(newState)).toThrow('Cannot add timeframe state to sealed snapshot');
    });

    it('should report sealed status correctly', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      expect(snapshot.isSealed()).toBe(true);
    });
  });

  describe('Reference Isolation', () => {
    it('should return consistent candle references from sealed snapshot', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      const firstRead = snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);
      const secondRead = snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);
      const thirdRead = snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);

      expect(firstRead).toBe(secondRead); // Same reference
      expect(secondRead).toBe(thirdRead); // Same reference
      expect(firstRead?.id).toBe(secondRead?.id);
    });

    it('should preserve candle properties across multiple reads', () => {
      const candles5m = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');
      const snapshot = MTFCalculator.getMTFSnapshot([candles5m], asOfTime, 'RELIANCE');

      const candle1 = snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);
      const candle2 = snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);

      if (candle1 && candle2) {
        expect(candle1.symbol).toBe(candle2.symbol);
        expect(candle1.ohlc.open).toBe(candle2.ohlc.open);
        expect(candle1.ohlc.close).toBe(candle2.ohlc.close);
        expect(candle1.status).toBe(candle2.status);
      }
    });
  });

  describe('Multi-Symbol Isolation', () => {
    it('should maintain separate snapshots for different symbols', () => {
      const candleREL = createClosedCandle(
        'RELIANCE',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );
      const candleINFY = createClosedCandle(
        'INFY',
        TimeframeValue.FIVE_MIN,
        '2026-08-21T09:15:00',
        '2026-08-21T09:20:00',
      );

      const asOfTime = istTimeString('2026-08-21T09:20:00');

      const snapshotREL = MTFCalculator.getMTFSnapshot([candleREL, candleINFY], asOfTime, 'RELIANCE');
      const snapshotINFY = MTFCalculator.getMTFSnapshot([candleREL, candleINFY], asOfTime, 'INFY');

      const rel5m = snapshotREL.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);
      const infy5m = snapshotINFY.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN);

      expect(rel5m?.symbol).toBe('RELIANCE');
      expect(infy5m?.symbol).toBe('INFY');

      // Verify they're different candles
      expect(rel5m?.id).not.toBe(infy5m?.id);
    });
  });

  describe('State Array Isolation', () => {
    it('should return independent copies of state arrays', () => {
      const candles = [
        createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00'),
        createClosedCandle(
          'RELIANCE',
          TimeframeValue.FIFTEEN_MIN,
          '2026-08-21T09:15:00',
          '2026-08-21T09:30:00',
        ),
      ];

      const asOfTime = istTimeString('2026-08-21T09:30:00');
      const snapshot = MTFCalculator.getMTFSnapshot(candles, asOfTime, 'RELIANCE');

      const states1 = snapshot.getAllTimeframeStates();
      const states2 = snapshot.getAllTimeframeStates();

      // Should be different arrays
      expect(states1).not.toBe(states2);

      // But contain same data
      expect(states1).toHaveLength(states2.length);
    });
  });

  describe('Snapshot Consistency Over Time', () => {
    it('should not drift when same snapshot is queried multiple times', () => {
      const candles = [
        createClosedCandle('RELIANCE', TimeframeValue.FIVE_MIN, '2026-08-21T09:15:00', '2026-08-21T09:20:00'),
        createClosedCandle(
          'RELIANCE',
          TimeframeValue.FIFTEEN_MIN,
          '2026-08-21T09:15:00',
          '2026-08-21T09:30:00',
        ),
        createClosedCandle('RELIANCE', TimeframeValue.SIXTY_MIN, '2026-08-21T09:15:00', '2026-08-21T10:15:00'),
      ];

      const asOfTime = istTimeString('2026-08-21T10:15:00');
      const snapshot = MTFCalculator.getMTFSnapshot(candles, asOfTime, 'RELIANCE');

      // Query multiple times
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push({
          time: snapshot.asOfTimeUTC.getTime(),
          candle5m: snapshot.getLatestConfirmedCandle(TimeframeValue.FIVE_MIN)?.id,
          candle15m: snapshot.getLatestConfirmedCandle(TimeframeValue.FIFTEEN_MIN)?.id,
          candle60m: snapshot.getLatestConfirmedCandle(TimeframeValue.SIXTY_MIN)?.id,
        });
      }

      // All results should be identical
      for (let i = 1; i < results.length; i++) {
        expect(results[i].time).toBe(results[0].time);
        expect(results[i].candle5m).toBe(results[0].candle5m);
        expect(results[i].candle15m).toBe(results[0].candle15m);
        expect(results[i].candle60m).toBe(results[0].candle60m);
      }
    });
  });
});
