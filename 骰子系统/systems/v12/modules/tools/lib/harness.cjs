'use strict';

const assert = require('node:assert/strict');

let passed = 0;
let current = '';
const failures = [];

function section(title) {
  current = title;
  console.log('\n[' + title + ']');
}

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + label);
  } catch (error) {
    failures.push({ section: current, label, error });
    console.log('  ✗ ' + label);
  }
}

function report() {
  if (failures.length) {
    console.error('\n失败 ' + failures.length + ' 项：');
    for (const failure of failures) {
      console.error('  ' + failure.section + ' / ' + failure.label);
      console.error('    ' + (failure.error && failure.error.stack ? failure.error.stack.split('\n').slice(0, 4).join('\n    ') : failure.error));
    }
    console.error('\n通过 ' + passed + ' 项，失败 ' + failures.length + ' 项');
    process.exitCode = 1;
    return false;
  }
  console.log('\n全部通过：' + passed + ' 项');
  return true;
}

module.exports = { assert, test, section, report, passed: () => passed, failures: () => failures };
