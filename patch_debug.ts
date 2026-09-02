import { LiveOrchestrator } from './src/live/live-orchestrator';

// Monkey-patch emit to log all events
const orig = LiveOrchestrator.prototype.emit;
LiveOrchestrator.prototype.emit = function(event, ...args) {
  if (event === 'decision') {
    console.log('✅ Decision emitted:', (args[0] as any).action, (args[0] as any).symbol);
  }
  return orig.call(this, event, ...args);
};
