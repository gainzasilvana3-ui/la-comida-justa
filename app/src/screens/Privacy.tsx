import { config } from '../config';

/** Política de privacidad. Texto base: conviene que lo revise un profesional antes de publicar. */
export function Privacy() {
  return (
    <div className="card">
      <h2>Política de privacidad</h2>
      <p className="small muted">Última actualización: octubre de 2026.</p>

      <h3>Qué guarda la app en tu teléfono</h3>
      <p>
        Tus recetas propias, menús, comensales, despensa, listas de compras, precios que cargues y preferencias se guardan{' '}
        <strong>solamente en tu dispositivo</strong> (en el almacenamiento del navegador). No se envían a ningún servidor ni se sincronizan
        entre dispositivos.
      </p>

      <h3>Qué se envía a nuestro servidor</h3>
      <ul>
        <li>
          <strong>Para verificar tu compra:</strong> el código de compra o de recuperación (o el mail y el número de pedido de tu compra),
          una clave pública generada por tu dispositivo (no permite identificarte) y la versión de la app.
        </li>
        <li>
          <strong>Para renovar el acceso:</strong> el identificador anónimo de tu dispositivo, una firma digital y la hora.
        </li>
        <li>
          <strong>Errores técnicos (opcional):</strong> el texto técnico del error y la pantalla donde ocurrió. Se borran a los 30 días. Podés
          desactivarlo en Ajustes.
        </li>
      </ul>
      <p>
        El servidor guarda la fecha de activación y de la última conexión de cada dispositivo. Cuando comprás en la tienda, recibe tu mail y
        tu número de pedido y los guarda solo en forma irreversible, para reconocer tu compra al activar. No guarda tu nombre, mail en texto,
        teléfono, ubicación, contactos ni datos bancarios. Las direcciones IP se usan solo para limitar intentos y se guardan de forma irreversible (con un código
        derivado), por poco tiempo.
      </p>

      <h3>Servicios de terceros</h3>
      <p>
        La app y el servidor funcionan en Cloudflare. Al activar, se usa Cloudflare Turnstile para evitar ataques automatizados. Cloudflare
        procesa datos técnicos de conexión según su propia política de privacidad.
      </p>

      <h3>Lo que no hacemos</h3>
      <ul>
        <li>No usamos publicidad, cookies de seguimiento ni análisis de comportamiento.</li>
        <li>No pedimos acceso a tu ubicación, contactos, cámara ni micrófono.</li>
        <li>No vendemos ni compartimos datos.</li>
      </ul>

      <h3>Tus datos, tu control</h3>
      <p>
        Podés exportar todos tus datos en cualquier momento desde Ajustes, y borrarlos desde Ajustes o borrando los datos del navegador. Si
        querés que demos de baja tu licencia y los registros técnicos asociados, escribinos{config.supportContact ? ` a ${config.supportContact}` : ''}.
      </p>

      <h3>Responsable</h3>
      <p>Llegar a fin de mes. {config.supportContact ? `Contacto: ${config.supportContact}.` : ''}</p>
    </div>
  );
}
