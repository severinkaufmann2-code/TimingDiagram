import type { Cell, Channel, Doc } from './types';

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
    groups: [],
    comments: [],
    channels: [
      {
        id: 'c1',
        group: null,
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
        group: null,
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
        group: null,
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
        group: null,
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
        group: null,
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

/**
 * The same machine in three states, as an example of groups, phases and
 * comments: the normal cycle, an emergency stop on the way out, and a sensor
 * that never answers.
 */
export function sampleGroupsDoc(): Doc {
  const base = sampleDoc();
  const step = (value: number): Cell => ({ value, mode: 'step' });
  const ramp = (value: number): Cell => ({ value, mode: 'ramp' });
  const digital = (id: string, group: string, name: string, color: number, cells: Record<string, Cell>): Channel => ({
    id,
    group,
    name,
    kind: 'digital',
    color,
    unit: '',
    min: 0,
    max: 1,
    initial: 0,
    cells,
  });
  const cylinder = (id: string, group: string, cells: Record<string, Cell>): Channel => ({
    id,
    group,
    name: 'Cylinder A',
    kind: 'analog',
    color: 2,
    unit: 'mm',
    min: 0,
    max: 100,
    initial: 0,
    cells,
  });
  return {
    ...base,
    points: [...base.points, { id: 'p7', time: 2 }].sort((a, b) => a.time - b.time),
    groups: [
      {
        id: 'g1',
        title: 'Normal cycle',
        phases: [
          { id: 'h1', title: 'Wait', from: { time: 0 }, to: { point: 'p2' } },
          { id: 'h2', title: 'Extend', from: { point: 'p2' }, to: { point: 'p3' } },
          { id: 'h3', title: 'Hold', from: { point: 'p3' }, to: { point: 'p5' } },
          { id: 'h4', title: 'Retract', from: { point: 'p5' }, to: { point: 'p6' } },
        ],
      },
      {
        id: 'g2',
        title: 'Emergency stop',
        phases: [
          { id: 'h5', title: 'Wait', from: { time: 0 }, to: { point: 'p2' } },
          { id: 'h6', title: 'Extend', from: { point: 'p2' }, to: { point: 'p7' } },
          { id: 'h7', title: 'Retract', from: { point: 'p7' }, to: { point: 'p3' } },
          { id: 'h8', title: 'Locked', from: { point: 'p3' }, to: { time: 8 } },
        ],
      },
      {
        id: 'g3',
        title: 'Sensor fault',
        phases: [
          { id: 'h9', title: 'Wait', from: { time: 0 }, to: { point: 'p2' } },
          { id: 'h10', title: 'Extend', from: { point: 'p2' }, to: { point: 'p3' } },
          { id: 'h11', title: 'Timeout', from: { point: 'p3' }, to: { point: 'p5' } },
          { id: 'h12', title: 'Retract', from: { point: 'p5' }, to: { point: 'p6' } },
          { id: 'h13', title: 'Alarm', from: { point: 'p6' }, to: { time: 8 } },
        ],
      },
    ],
    channels: [
      ...base.channels.map((channel) => ({ ...channel, group: 'g1' })),
      digital('c6', 'g2', 'E-stop', 7, { p7: step(1) }),
      digital('c7', 'g2', 'Valve Y1', 1, { p2: step(1), p7: step(0) }),
      cylinder('c8', 'g2', { p2: step(0), p7: ramp(50), p3: ramp(0) }),
      digital('c9', 'g3', 'Valve Y1', 1, { p2: step(1), p5: step(0) }),
      cylinder('c10', 'g3', { p2: step(0), p3: ramp(100), p5: step(100), p6: ramp(0) }),
      digital('c11', 'g3', 'Sensor B1', 3, {}),
      digital('c12', 'g3', 'Alarm H1', 7, { p5: step(1) }),
    ],
    comments: [
      {
        id: 'n1',
        text: 'Double-acting cylinder with a 5/2 valve (Y1, spring return). All times are typical values at 6 bar.',
        on: { kind: 'diagram' },
      },
      { id: 'n2', text: 'End of the dwell time T1.', on: { kind: 'diagram', at: { point: 'p5' } } },
      { id: 'n3', text: 'Started with the start button while the guard door is closed.', on: { kind: 'group', group: 'g1' } },
      { id: 'n4', text: 'Dwell time T1 = 2 s, set in the controller.', on: { kind: 'phase', phase: 'h3' } },
      { id: 'n5', text: 'Y1 switches on the falling edge of the start button.', on: { kind: 'channel', channel: 'c2', at: { point: 'p2' } } },
      {
        id: 'n6',
        text: 'Retracts faster than it extends: the exhaust throttle is fully open.',
        on: { kind: 'channel', channel: 'c3', at: { time: 5.75 } },
      },
      { id: 'n7', text: 'Reed switch at the front end position.', on: { kind: 'channel', channel: 'c4' } },
      { id: 'n8', text: 'E-stop pressed while the cylinder is still extending.', on: { kind: 'channel', channel: 'c6', at: { point: 'p7' } } },
    ],
  };
}
