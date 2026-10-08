/**
 * El apagado programado. El servidor de datos no esta encendido las 24 h. Un "502
 * Bad Gateway" a las 3 de la manana manda a alguien a buscar un bug que no existe,
 * asi que la consola tiene que distinguir "esta apagado" de "esta roto".
 */
import { check } from "./registro.mjs";
import { cargar, renderizar } from "./entorno.mjs";

export function verificarApagado() {
  const cliente = cargar("app/lib/client.js");
  const { Estado } = cargar("app/components/console/Estado.js");

  check("un 502 del proxy se lee como servidor apagado",
    cliente.servidorApagado({ status: 502, ok: false, data: {} }) === true);
  check("un fetch que ni salio (status 0), tambien",
    cliente.servidorApagado({ status: 0, ok: false, data: {} }) === true);
  check("el mensaje del proxy tambien lo delata",
    cliente.servidorApagado({ status: 500, ok: false,
      data: { error: "servicio inaccesible: connect ECONNREFUSED" } }) === true);
  check("pero un 401 NO es un apagado, es una sesion vencida",
    cliente.servidorApagado({ status: 401, ok: false, data: {} }) === false);
  check("ni un 422, que es un error de verdad",
    cliente.servidorApagado({ status: 422, ok: false, data: { detail: "faltan campos" } }) === false);

  const apagado = renderizar(Estado,
    { error: cliente.mensajeError({ status: 502, ok: false, data: {} }), que: "la serie" });
  check("el panel de apagado lo dice con esas palabras", /Servidor apagado/.test(apagado));
  check("y dice cuando vuelve", /07:00/.test(apagado) && /19:00/.test(apagado));
  check("no ofrece reintentar: no hay nada que reintentar", !/Reintentar/.test(apagado));
  check("y aclara que la documentacion sigue en pie", /documentación/.test(apagado));

  const roto = renderizar(Estado,
    { error: "el servicio respondió 500", que: "la serie", onReintentar: () => {} });
  check("un error de verdad sigue pintandose como error", /No se pudieron cargar/.test(roto));
  check("y ese si ofrece reintentar", /Reintentar/.test(roto));
}
