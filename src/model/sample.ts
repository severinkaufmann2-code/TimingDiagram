import type { Doc } from './types';

/**
 * The diagram a first-time visitor sees: a pneumatic cylinder that extends and
 * retracts. It shows digital steps, analog ramps and a mix of both in one channel.
 */
export function sampleDoc(): Doc {
  return {
    title: 'Cylinder A: extend and retract',
    time: { unit: 's', start: 0, end: 8, snap: 0.1 },
    points: [
      { id: 'p1', time: 0.5 },
      { id: 'p2', time: 1 },
      { id: 'p3', time: 3 },
      { id: 'p4', time: 4 },
      { id: 'p5', time: 5 },
      { id: 'p6', time: 6.5 },
    ],
    channels: [
      {
        id: 'c1',
        name: 'Start button',
        kind: 'digital',
        color: 0,
        unit: '',
        min: 0,
        max: 1,
        initial: 0,
        cells: { p1: { value: 1, mode: 'step' }, p2: { value: 0, mode: 'step' } },
      },
      {
        id: 'c2',
        name: 'Valve Y1',
        kind: 'digital',
        color: 1,
        unit: '',
        min: 0,
        max: 1,
        initial: 0,
        cells: { p2: { value: 1, mode: 'step' }, p5: { value: 0, mode: 'step' } },
      },
      {
        id: 'c3',
        name: 'Cylinder A',
        kind: 'analog',
        color: 2,
        unit: 'mm',
        min: 0,
        max: 100,
        initial: 0,
        cells: {
          p2: { value: 0, mode: 'step' },
          p3: { value: 100, mode: 'ramp' },
          p5: { value: 100, mode: 'step' },
          p6: { value: 0, mode: 'ramp' },
        },
      },
      {
        id: 'c4',
        name: 'Sensor B1',
        kind: 'digital',
        color: 3,
        unit: '',
        min: 0,
        max: 1,
        initial: 0,
        cells: { p3: { value: 1, mode: 'step' }, p5: { value: 0, mode: 'step' } },
      },
      {
        id: 'c5',
        name: 'Pressure',
        kind: 'analog',
        color: 4,
        unit: 'bar',
        min: 0,
        max: 6,
        initial: 0,
        cells: {
          p3: { value: 0, mode: 'step' },
          p4: { value: 6, mode: 'ramp' },
          p5: { value: 0, mode: 'step' },
        },
      },
    ],
  };
}
