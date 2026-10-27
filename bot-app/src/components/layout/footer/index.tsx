// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
// Language, Theme y Log out se movieron a la barra lateral izquierda
// (components/layout/sidebar). El footer queda con pantalla completa,
// hora del servidor y estado de conexión, como en el Deriv Bot original.
import FullScreen from './FullScreen';
import NetworkStatus from './NetworkStatus';
import ServerTime from './ServerTime';
import './footer.scss';

const Footer = () => {
    return (
        <footer className='app-footer'>
            <FullScreen />
            <ServerTime />
            <div className='app-footer__vertical-line' />
            <NetworkStatus />
        </footer>
    );
};

export default Footer;
