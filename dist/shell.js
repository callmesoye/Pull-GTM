// Native details/summary supplies the mobile disclosure's keyboard and expanded state.
let attached = false;
export function attachShell() {
  if (attached) return;
  const navigation = document.querySelector('#workspace-navigation');
  if (!navigation) return;
  attached = true;
  const compact = window.matchMedia('(max-width: 760px)');
  const summary = navigation.querySelector('summary');
  const fitNavigation = () => { navigation.open = !compact.matches; };
  fitNavigation();
  compact.addEventListener('change', fitNavigation);
  navigation.addEventListener('click', event => {
    if (compact.matches && event.target.closest('button[data-view]')) navigation.open = false;
  });
  navigation.addEventListener('keydown', event => {
    if (compact.matches && navigation.open && event.key === 'Escape') {
      event.preventDefault();
      navigation.open = false;
      summary.focus();
    }
  });
}
attachShell();
