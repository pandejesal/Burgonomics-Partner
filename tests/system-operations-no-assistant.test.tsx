import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { SystemOperationsLayout } from '../src/admin/layouts/SystemOperationsLayout';

it('does not offer a diagnostics assistant without a backend', () => {
  const html = renderToStaticMarkup(<MemoryRouter><SystemOperationsLayout /></MemoryRouter>);
  expect(html).not.toContain('Ask about queues');
  expect(html).not.toContain('MISSION CONTROL DIAGNOSTICS');
});
