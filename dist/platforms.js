// Availability is an honest product capability, not a claim that an account is connected.
export const DESTINATIONS = Object.freeze([
  {id:'none',name:'No channel yet',group:'Workspace',path:'Review results inside Pull',note:'Keep fit review and drafts in your workspace.'},
  {id:'linkedin',name:'LinkedIn',group:'Social',path:'Review, then copy to LinkedIn',note:'Personal messages stay manual. Page publishing needs an approved app and page role.'},
  {id:'instagram',name:'Instagram',group:'Social',path:'Review, then open Instagram',note:'Professional account publishing and inbound messaging require Meta permissions.'},
  {id:'facebook',name:'Facebook',group:'Social',path:'Review, then open Facebook',note:'Page actions require Meta permissions and the right page role.'},
  {id:'x',name:'X',group:'Social',path:'Review, then open X',note:'Posting through an app requires approved X API access and user consent.'},
  {id:'jiji',name:'Jiji',group:'Marketplaces',path:'Review, then open Jiji',note:'Prepare listing and enquiry responses; posting and messages stay in your Jiji account.'},
  {id:'shopify',name:'Shopify',group:'Commerce',path:'Review, then open Shopify',note:'Store data and marketing actions require a merchant-approved app.'},
  {id:'whatsapp',name:'WhatsApp Business',group:'Messaging',path:'Review, then open WhatsApp',note:'Business messaging needs a connected account, consent and approved templates where required.'},
  {id:'email',name:'Email',group:'Messaging',path:'Review, then use your mailbox',note:'Sending needs a verified mailbox, unsubscribe and suppression handling.'},
  {id:'other',name:'Another platform',group:'Other',path:'Review, export and use your platform',note:'Pull prepares the evidence and draft; check that platform’s rules before use.'}
]);

export const destination = id => DESTINATIONS.find(item=>item.id===id) || DESTINATIONS[0];
export const destinationIds = DESTINATIONS.map(item=>item.id);

export function renderPlatformOptions(selected='none',escape=value=>String(value)) {
  return DESTINATIONS.map(item=>`<option value="${item.id}" ${selected===item.id?'selected':''}>${escape(item.name)}</option>`).join('');
}
