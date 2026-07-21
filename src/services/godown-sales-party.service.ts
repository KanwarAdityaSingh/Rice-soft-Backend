import { godownDAO } from '../dao/godown.dao';
import { salesPartyDAO } from '../dao/sales-party.dao';
import type { ContactPerson } from '../models/vendor.model';
import { NotFoundError, ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * Ensure the destination godown has a linked sales party (invoice/e-way face).
 * Creates one from godown master data on first use, then reuses the link.
 */
export async function ensureSalesPartyForGodown(
  godownId: string,
  userId?: string
): Promise<string> {
  const godown = await godownDAO.findById(godownId);
  if (!godown) throw new NotFoundError('Godown not found');
  if (!godown.is_active) throw new ValidationError('Godown is inactive');

  if (godown.sales_party_id) {
    const existing = await salesPartyDAO.findById(godown.sales_party_id);
    if (existing) return existing.id;
  }

  const gst = (godown.gst_number || '').trim();
  const contactPersons: ContactPerson[] =
    godown.contact_persons?.length > 0
      ? godown.contact_persons.map((c) => ({
          name: c.name || godown.name,
          phones: c.phones?.length ? c.phones : ['0000000000'],
          emails: c.emails,
        }))
      : [{ name: godown.name, phones: ['0000000000'] }];

  const party = await salesPartyDAO.create({
    business_name: godown.name,
    contact_persons: contactPersons,
    address: godown.address,
    business_details: gst ? { gst_number: gst } : {},
    registration_type: gst ? 'registered' : 'unregistered',
    google_location_link: godown.google_maps_link ?? undefined,
    is_verified: true,
    is_active: true,
    created_by: userId,
  });

  await godownDAO.update(godownId, {
    sales_party_id: party.id,
    updated_by: userId,
  });

  logger.info('Auto-created sales party for godown', {
    godownId,
    salesPartyId: party.id,
  });

  return party.id;
}
