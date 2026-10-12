import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findInvalidModelAssignments,
  getNodeAvailableDegreesOfFreedom,
  validateDisplacementDegreesOfFreedom,
  validateLoadDegreesOfFreedom,
  validateSupportDegreesOfFreedom,
} from './degreesOfFreedom.ts';

const quad = { type: 'quad4', id: 'q1', nodeIds: ['a', 'b', 'c', 'd'] };
const components = { ux: 0, uy: 0, uz: 0, tx: 0, ty: 0, tz: 0 };

test('quad nodes expose only the two translations in their mesh plane', () => {
  assert.deepEqual(
    [...getNodeAvailableDegreesOfFreedom('a', [quad], 'XY')],
    ['ux', 'uy'],
  );
  assert.deepEqual(
    [...getNodeAvailableDegreesOfFreedom('a', [quad], 'XZ')],
    ['ux', 'uz'],
  );
  assert.deepEqual(
    [...getNodeAvailableDegreesOfFreedom('a', [quad], 'YZ')],
    ['uy', 'uz'],
  );
});

test('checks global nodal DOFs, not the stiffness of every connected element', () => {
  const twoQuads = [quad, { ...quad, id: 'q2' }];
  assert.deepEqual(
    validateLoadDegreesOfFreedom(
      'a',
      { Fx: 10, Fy: 0, Fz: 0, Mx: 0, My: 0, Mz: 0 },
      twoQuads,
      'XY',
    ),
    [],
  );
  assert.deepEqual(
    validateLoadDegreesOfFreedom(
      'a',
      { Fx: 0, Fy: 0, Fz: 10, Mx: 0, My: 0, Mz: 0 },
      twoQuads,
      'XY',
    ),
    ['uz'],
  );
});

test('validates active zero-valued prescribed displacements and supports', () => {
  assert.deepEqual(validateDisplacementDegreesOfFreedom('a', ['uz'], [quad], 'XY'), ['uz']);
  assert.deepEqual(
    validateSupportDegreesOfFreedom({
      nodeId: 'a',
      restraints: { ux: true, uy: false, uz: true, tx: false, ty: false, tz: false },
    }, [quad], 'XY'),
    ['uz'],
  );
  const invalid = findInvalidModelAssignments(
    [],
    [{ nodeId: 'a', components, activeDofs: ['tz'] }],
    [],
    [quad],
    'XY',
  );
  assert.equal(invalid.length, 1);
  assert.match(invalid[0], /deslocamento prescrito em a: tz/);
});

test('a node connected only to explicit 1D elements has no 2D DOFs assigned', () => {
  assert.deepEqual([...getNodeAvailableDegreesOfFreedom('a', [], 'XY')], []);
});
