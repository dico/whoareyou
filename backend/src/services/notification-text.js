// Norwegian notification sentences shared by e-mail digest and push, so the
// two channels say the same thing. Mirrors notifications.anniversaryByType
// in frontend/locales/nb.json (the in-app list) — keep them in sync.

const ANNIVERSARY_NB = {
  married: '{name} har bryllupsdag – {years}',
  engaged: 'Det er {years} siden {name} forlovet seg',
  child_born: 'Det er {years} siden {name} fikk barn',
  moved: 'Det er {years} siden {name} flyttet',
  new_job: 'Det er {years} siden {name} begynte i ny jobb',
  retired: 'Det er {years} siden {name} ble pensjonist',
  graduated: 'Det er {years} siden {name} ble ferdig utdannet',
  passed_away: 'Det er {years} siden {name} gikk bort',
  divorced: 'Det er {years} siden {name} ble skilt',
};

/**
 * Sentence for an anniversary notification. `n.body` is
 * "{contact_uuid}|{event_type}|{years}" (see notification-generate.js).
 * Custom event types (user-named) fall back to "{name}: {type} for N år siden".
 */
export function anniversaryText(n) {
  const [, eventType = '', years = ''] = (n.body || '').split('|');
  const yearsText = `${years} år`;
  const template = ANNIVERSARY_NB[eventType] || `{name}: ${eventType} for {years} siden`;
  return template.replace('{years}', yearsText).replace('{name}', () => n.title);
}

export function anniversaryEventType(n) {
  return (n.body || '').split('|')[1] || '';
}
