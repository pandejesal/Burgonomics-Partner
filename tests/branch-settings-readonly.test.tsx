/**
 * firestore.rules: branches update admits brand_owner/developer, or a branch
 * member without the protected keys. support and regional_manager match no
 * arm, so their form must be read-only with a short note — never a save that
 * can only fail.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BranchSettingsModal } from '@/components/stores/BranchSettingsModal';

const branch = {
  id: 'branch_surat_01',
  name: 'Surat Adajan',
  city: 'Surat',
  address: 'Adajan',
  phone: '+91 90000 00000',
  active: true,
  status: 'active',
  acceptingOrdersStatus: 'open',
  deliveryRadiusKm: 7,
  petpoojaStoreId: 'PP_SURAT_01',
  coordinates: { lat: 21.19, lng: 72.79 },
} as any;

const render = (readOnly: boolean) =>
  renderToStaticMarkup(
    <BranchSettingsModal
      isOpen
      onClose={() => {}}
      branch={branch}
      onSave={vi.fn()}
      readOnly={readOnly}
    />
  );

describe('BranchSettingsModal — role read-only state', () => {
  it('renders a read-only form with an explanatory note for support/regional', () => {
    const html = render(true);
    expect(html).toContain('read-only');
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
  });

  it('stays editable for brand roles', () => {
    const html = render(false);
    expect(html).not.toContain('read-only');
    expect(html).toContain('Save &amp; Sync to Delivery App');
  });
});
