// Move the original controls, preserving their IDs, state and delegated handlers.
const mobileHeader=document.querySelector('.mobile-header');
const search=document.querySelector('.global-search');
const account=document.querySelector('#account-button');
const media=window.matchMedia('(max-width:767px)');
const searchAnchor=document.createComment('Search desktop position');
const accountAnchor=document.createComment('Account desktop position');
search.before(searchAnchor);
account.before(accountAnchor);
function arrangeNavigation(){
  if(media.matches){
    mobileHeader.append(search,account);
  }else{
    searchAnchor.after(search);
    accountAnchor.after(account);
  }
}
media.addEventListener('change',arrangeNavigation);
arrangeNavigation();
