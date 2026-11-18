/** Presentation aliases for old assistant-owned copy. Never rewrite questions,
 * names, account records, saved messages or financial values. */
const legacyCopy=new Map([
 ['I’m Lux, your Lumo money buddy.','I’m Lumo, your money buddy.'],
 ['I’m Lux, your money buddy.','I’m Lumo, your money buddy.'],
 ['Lux here. What’s the money question today?','Lumo here. What’s the money question today?'],
 ['Lux here.','Lumo here.'],
 ['Ask Lux','Ask Lumo'],
 ['Learn with Lux','Learn with Lumo'],
 ['More with Lux','More with Lumo'],
 ['Try it with Lux','Try it with Lumo'],
 ['Explore with Lux','Explore with Lumo'],
 ['How Lux worked this out','How Lumo worked this out'],
 ['Sign in to use connected Ask Lux.','Sign in to use connected Ask Lumo.'],
 ['Sign in again to ask Lux.','Sign in again to ask Lumo.'],
 ['Lux could not read that reply. Try again.','Lumo could not read that reply. Try again.'],
 ['I couldn’t connect to Lux. Try again; your question has not moved any money.','I couldn’t connect to Lumo. Try again; your question has not moved any money.'],
 ['I couldn’t reach Lux. Try again when you’re connected.','I couldn’t reach Lumo. Try again when you’re connected.'],
]);
const stockMessages=new Map([
 ['Open Learn with Lux and choose your focus first.','Open Learn with Lumo and choose your focus first.'],
 ['Lux is ready for the next run.','Lumo is ready for the next run.'],
 ['Try it with Lux.','Try it with Lumo.'],
]);
export const assistantStatusCopy=value=>typeof value==='string'?stockMessages.get(value)??value:value;
export const assistantDisplayCopy=value=>typeof value==='string'?legacyCopy.get(value)??assistantStatusCopy(value):value;
export const assistantSpeakerName=value=>value==='Lux'?'Lumo':value;
