// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { t } from '../public/js/translations.js';

describe('removed dead keys fall back to key name', () => {
  it('whereAmIHeaded', () => expect(t('whereAmIHeaded')).toBe('whereAmIHeaded'));
  it('rateThisSession', () => expect(t('rateThisSession')).toBe('rateThisSession'));
  it('done',           () => expect(t('done')).toBe('done'));
  it('sessionConfirmed', () => expect(t('sessionConfirmed')).toBe('sessionConfirmed'));
  it('reflectionClosed', () => expect(t('reflectionClosed')).toBe('reflectionClosed'));
});

describe('kept keys still return correct strings', () => {
  it('send',            () => expect(t('send')).toBe('Send'));
  it('confirmSession',  () => expect(t('confirmSession')).toBe('✓ Confirm Session'));
  it('weekPlanAgreed',  () => expect(t('weekPlanAgreed')).toBe('Week plan agreed'));
  it('agreeWeekPlan',   () => expect(t('agreeWeekPlan')).toBe('✓ Agree week plan'));
  it('endCoachChat',    () => expect(t('endCoachChat')).toBe('End chat'));
  it('sendResponse',    () => expect(t('sendResponse')).toBe('Send Response'));
});

describe('Expanded Week keys', () => {
  it('expandAll',   () => expect(t('expandAll')).toBe('Expand all'));
  it('collapseAll', () => expect(t('collapseAll')).toBe('Collapse all'));
});
