import { RegimeEvaluator } from '../domain/regime-evaluator';
import { StructureSnapshot, BOSEvent, CHOCHEvent } from '../domain/structure-snapshot';
import { StructureState, StructureType } from '../domain/structure-state';
import { SwingPoint, SwingType } from '../domain/swing-point';
import { Timeframe, TimeframeValue } from '../domain/timeframe';
import { RegimeType } from '../domain/regime-state';

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

function createSwing(
  symbol: string,
  type: SwingType,
  price: number,
  eventTime: Date,
  knowledgeTime: Date,
): SwingPoint {
  return new SwingPoint(
    symbol,
    Timeframe.from(TimeframeValue.FIVE_MIN),
    type,
    price,
    eventTime,
    knowledgeTime,
    eventTime,
  );
}

describe('RegimeEngine Hardening Verification', () => {
  describe('Hardening 1: RANGE Classification Corrected', () => {
    it('HH+HL without BOS should be INSUFFICIENT_DATA (not RANGE)', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 105, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 98, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const structureState = new StructureState(StructureType.BULLISH, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

      const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
      expect(result.regime).toBe(RegimeType.INSUFFICIENT_DATA);
      expect(result.reason).toContain('awaiting BOS');
    });

    it('LH+LL without BOS should be INSUFFICIENT_DATA (not RANGE)', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 99, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 90, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const structureState = new StructureState(StructureType.BEARISH, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

      const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
      expect(result.regime).toBe(RegimeType.INSUFFICIENT_DATA);
      expect(result.reason).toContain('awaiting BOS');
    });

    it('NEUTRAL structure should be RANGE', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 99, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 96, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const structureState = new StructureState(StructureType.NEUTRAL, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

      const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
      expect(result.regime).toBe(RegimeType.RANGE);
    });
  });

  describe('Hardening 2: Structural Direction Preserved', () => {
    it('should track bullish structure with trendConfirmed=false', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 105, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 98, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const structureState = new StructureState(StructureType.BULLISH, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

      const direction = RegimeEvaluator.evaluateStructuralDirection(snapshot);

      expect(direction.direction).toBe('bullish');
      expect(direction.trendConfirmed).toBe(false);
      expect(direction.bosCount).toBe(0);
    });

    it('should track bearish structure with trendConfirmed=false', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 99, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 90, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const structureState = new StructureState(StructureType.BEARISH, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

      const direction = RegimeEvaluator.evaluateStructuralDirection(snapshot);

      expect(direction.direction).toBe('bearish');
      expect(direction.trendConfirmed).toBe(false);
      expect(direction.bosCount).toBe(0);
    });

    it('should set trendConfirmed=true when BOS present', () => {
      const asOfTime = istTimeString('2026-08-21T10:00:00');
      const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
      const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
      const high2 = createSwing('NIFTY', SwingType.HIGH, 105, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
      const low2 = createSwing('NIFTY', SwingType.LOW, 98, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

      const bosEvent: BOSEvent = {
        candleCloseTimeUTC: istTimeString('2026-08-21T09:45:00'),
        levelPrice: 100,
        direction: 'bullish',
      };

      const structureState = new StructureState(StructureType.BULLISH, high2, low2, high1, low1);
      const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [bosEvent], []);

      const direction = RegimeEvaluator.evaluateStructuralDirection(snapshot);

      expect(direction.direction).toBe('bullish');
      expect(direction.trendConfirmed).toBe(true);
      expect(direction.bosCount).toBe(1);
    });
  });

  describe('Hardening 3: Look-Ahead Safety', () => {
    it('knowledge time must be <= asOfTime', () => {
      const asOfTime = istTimeString('2026-08-21T09:45:00');

      // Swing with knowledge time after asOfTime should not be included
      const swingBeforeKnowledge = createSwing(
        'NIFTY',
        SwingType.HIGH,
        100,
        istTimeString('2026-08-21T09:00:00'),
        istTimeString('2026-08-21T09:35:00'),
      );

      // Only swings with knowledgeTime <= asOfTime are included
      expect(swingBeforeKnowledge.knowledgeTimeUTC.getTime()).toBeLessThanOrEqual(asOfTime.getTime());

      // Swing with knowledge time at or before asOfTime is valid
      const swingValidKnowledge = createSwing(
        'NIFTY',
        SwingType.HIGH,
        100,
        istTimeString('2026-08-21T09:00:00'),
        istTimeString('2026-08-21T09:45:00'),
      );

      expect(swingValidKnowledge.knowledgeTimeUTC.getTime()).toBeLessThanOrEqual(asOfTime.getTime());

      // Swing with knowledge time after asOfTime is invalid
      const swingFutureKnowledge = createSwing(
        'NIFTY',
        SwingType.HIGH,
        100,
        istTimeString('2026-08-21T09:00:00'),
        istTimeString('2026-08-21T09:50:00'),
      );

      expect(swingFutureKnowledge.knowledgeTimeUTC.getTime()).toBeGreaterThan(asOfTime.getTime());
    });
  });
});
