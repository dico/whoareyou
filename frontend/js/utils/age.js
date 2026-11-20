import { t } from './i18n.js';

/**
 * Age shown next to a contact — one helper so lists, cards and trees agree.
 * For someone who has passed away (contacts.deceased_date) the age stops at
 * the date of death: "† 2015 · ble 98 år", never "106 år".
 */

/** Age in whole years at `refDate`; month/day refine it when known. */
export function ageAt(birthYear, birthMonth, birthDay, refDate = new Date()) {
  let age = refDate.getFullYear() - birthYear;
  if (birthMonth && birthDay) {
    const m = refDate.getMonth() + 1 - birthMonth;
    if (m < 0 || (m === 0 && refDate.getDate() < birthDay)) age--;
  }
  return age;
}

/**
 * Short label for cards and rows, or '' when nothing is known.
 * @param {{ birth_year?, birth_month?, birth_day?, deceased_date? }} c
 * @returns {{ icon: string, text: string }|null}
 */
export function ageLabel(c) {
  if (c.deceased_date) {
    const died = new Date(c.deceased_date);
    const parts = [`† ${died.getFullYear()}`];
    if (c.birth_year) parts.push(t('contacts.becameYears', { age: ageAt(c.birth_year, c.birth_month, c.birth_day, died) }));
    return { icon: 'flower1', text: parts.join(' · ') };
  }
  if (c.birth_year) return { icon: 'cake2', text: `${ageAt(c.birth_year, c.birth_month, c.birth_day)} ${t('contacts.years')}` };
  return null;
}

/** ageLabel() as `<i class="bi …"></i> text`, or ''. */
export function ageHtml(c) {
  const a = ageLabel(c);
  return a ? `<i class="bi bi-${a.icon}"></i> ${a.text}` : '';
}
