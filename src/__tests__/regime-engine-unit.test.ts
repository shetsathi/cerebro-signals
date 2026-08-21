import { RegimeEvaluator } from '../domain/regime-evaluator';
import { RegimeStateMachine } from '../domain/regime-state-machine';
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

describe('RegimeEvaluator', () => {
  it('should classify TREND_BULLISH with HH+HL and bullish BOS', () => {
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

    const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
    expect(result.regime).toBe(RegimeType.TREND_BULLISH);
  });

  it('should classify RANGE with HH+HL but no BOS', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
    const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
    const high2 = createSwing('NIFTY', SwingType.HIGH, 105, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
    const low2 = createSwing('NIFTY', SwingType.LOW, 98, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

    // No BOS events
    const structureState = new StructureState(StructureType.BULLISH, high2, low2, high1, low1);
    const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [], []);

    const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
    expect(result.regime).toBe(RegimeType.RANGE);
  });

  it('should classify TREND_BEARISH with LH+LL and bearish BOS', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const high1 = createSwing('NIFTY', SwingType.HIGH, 100, istTimeString('2026-08-21T09:00:00'), istTimeString('2026-08-21T09:10:00'));
    const low1 = createSwing('NIFTY', SwingType.LOW, 95, istTimeString('2026-08-21T09:05:00'), istTimeString('2026-08-21T09:15:00'));
    const high2 = createSwing('NIFTY', SwingType.HIGH, 99, istTimeString('2026-08-21T09:20:00'), istTimeString('2026-08-21T09:30:00'));
    const low2 = createSwing('NIFTY', SwingType.LOW, 90, istTimeString('2026-08-21T09:25:00'), istTimeString('2026-08-21T09:35:00'));

    const bosEvent: BOSEvent = {
      candleCloseTimeUTC: istTimeString('2026-08-21T09:45:00'),
      levelPrice: 95,
      direction: 'bearish',
    };

    const structureState = new StructureState(StructureType.BEARISH, high2, low2, high1, low1);
    const snapshot = new StructureSnapshot(asOfTime, [high1, low1, high2, low2], structureState, [bosEvent], []);

    const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
    expect(result.regime).toBe(RegimeType.TREND_BEARISH);
  });

  it('should return INSUFFICIENT_DATA for UNKNOWN structure', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const snapshot = new StructureSnapshot(asOfTime, [], new StructureState(StructureType.UNKNOWN), [], []);

    const result = RegimeEvaluator.evaluateStructureRegime(snapshot, asOfTime);
    expect(result.regime).toBe(RegimeType.INSUFFICIENT_DATA);
  });

  it('should detect bullish BOS', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const bosEvent: BOSEvent = {
      candleCloseTimeUTC: istTimeString('2026-08-21T09:45:00'),
      levelPrice: 100,
      direction: 'bullish',
    };

    const snapshot = new StructureSnapshot(asOfTime, [], new StructureState(StructureType.BULLISH), [bosEvent], []);

    expect(RegimeEvaluator.hasBullishBOS(snapshot)).toBe(true);
    expect(RegimeEvaluator.hasBearishBOS(snapshot)).toBe(false);
  });

  it('should detect bearish BOS', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const bosEvent: BOSEvent = {
      candleCloseTimeUTC: istTimeString('2026-08-21T09:45:00'),
      levelPrice: 100,
      direction: 'bearish',
    };

    const snapshot = new StructureSnapshot(asOfTime, [], new StructureState(StructureType.BEARISH), [bosEvent], []);

    expect(RegimeEvaluator.hasBearishBOS(snapshot)).toBe(true);
    expect(RegimeEvaluator.hasBullishBOS(snapshot)).toBe(false);
  });

  it('should detect CHOCH in correct direction', () => {
    const asOfTime = istTimeString('2026-08-21T10:00:00');
    const chochEvent: CHOCHEvent = {
      candleCloseTimeUTC: istTimeString('2026-08-21T09:45:00'),
      levelPrice: 95,
      direction: 'bearish',
    };

    const snapshot = new StructureSnapshot(asOfTime, [], new StructureState(StructureType.BULLISH), [], [chochEvent]);

    expect(RegimeEvaluator.hasConfirmedCHOCH(snapshot, 'bearish')).toBe(true);
    expect(RegimeEvaluator.hasConfirmedCHOCH(snapshot, 'bullish')).toBe(false);
  });
});

describe('RegimeStateMachine', () => {
  it('CHOCH in opposite direction should create TRANSITION, not immediate flip', () => {
    const newRegime = RegimeStateMachine.transitionFromCHOCH(RegimeType.TREND_BULLISH, 'bearish');
    expect(newRegime).toBe(RegimeType.TRANSITION);
  });

  it('Bullish CHOCH from bearish trend should create TRANSITION', () => {
    const newRegime = RegimeStateMachine.transitionFromCHOCH(RegimeType.TREND_BEARISH, 'bullish');
    expect(newRegime).toBe(RegimeType.TRANSITION);
  });

  it('BOS from TRANSITION in bullish direction should confirm TREND_BULLISH', () => {
    const newRegime = RegimeStateMachine.transitionFromBOS(RegimeType.TRANSITION, 'bullish');
    expect(newRegime).toBe(RegimeType.TREND_BULLISH);
  });

  it('BOS from TRANSITION in bearish direction should confirm TREND_BEARISH', () => {
    const newRegime = RegimeStateMachine.transitionFromBOS(RegimeType.TRANSITION, 'bearish');
    expect(newRegime).toBe(RegimeType.TREND_BEARISH);
  });

  it('BOS from RANGE in bullish direction should establish TREND_BULLISH', () => {
    const newRegime = RegimeStateMachine.transitionFromBOS(RegimeType.RANGE, 'bullish');
    expect(newRegime).toBe(RegimeType.TREND_BULLISH);
  });

  it('should validate valid transitions', () => {
    expect(RegimeStateMachine.isValidTransition(RegimeType.INSUFFICIENT_DATA, RegimeType.TREND_BULLISH)).toBe(true);
    expect(RegimeStateMachine.isValidTransition(RegimeType.RANGE, RegimeType.TREND_BEARISH)).toBe(true);
    expect(RegimeStateMachine.isValidTransition(RegimeType.TREND_BULLISH, RegimeType.TRANSITION)).toBe(true);
    expect(RegimeStateMachine.isValidTransition(RegimeType.TRANSITION, RegimeType.TREND_BULLISH)).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(RegimeStateMachine.isValidTransition(RegimeType.TREND_BULLISH, RegimeType.TREND_BEARISH)).toBe(false);
  });
});

describe('RegimeSnapshot Immutability', () => {
  it('should have sealed snapshot', () => {
    const snapshot = new (require('../domain/regime-snapshot').RegimeSnapshot)(
      'NIFTY',
      istTimeString('2026-08-21T10:00:00'),
      istTimeString('2026-08-21T10:00:00'),
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
      RegimeType.RANGE,
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
    );

    snapshot.seal();
    expect(snapshot.isSealed()).toBe(true);
  });

  it('should provide defensive copy of timestamps', () => {
    const RegimeSnapshot = require('../domain/regime-snapshot').RegimeSnapshot;
    const snapshot = new RegimeSnapshot(
      'NIFTY',
      istTimeString('2026-08-21T10:00:00'),
      istTimeString('2026-08-21T10:00:00'),
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
      RegimeType.RANGE,
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
    );

    const time1 = snapshot.asOfTimeUTC;
    const time2 = snapshot.asOfTimeUTC;

    // Different object references (defensive copy)
    expect(time1 === time2).toBe(false);
    // Same underlying time value
    expect(time1.getTime()).toBe(time2.getTime());
  });

  it('should provide defensive copy of evidence', () => {
    const RegimeSnapshot = require('../domain/regime-snapshot').RegimeSnapshot;
    const snapshot = new RegimeSnapshot(
      'NIFTY',
      istTimeString('2026-08-21T10:00:00'),
      istTimeString('2026-08-21T10:00:00'),
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
      RegimeType.RANGE,
      RegimeType.TREND_BULLISH,
      RegimeType.TREND_BULLISH,
      null,
      { structurePresent: true, bosCount: 2, chochCount: 0, swingCount: 4 },
    );

    const evidence1 = snapshot.getEvidence(TimeframeValue.DAILY);
    const evidence2 = snapshot.getEvidence(TimeframeValue.DAILY);

    // Different objects
    expect(evidence1 === evidence2).toBe(false);
    // Same values
    expect(evidence1.bosCount).toBe(evidence2.bosCount);
  });
});
