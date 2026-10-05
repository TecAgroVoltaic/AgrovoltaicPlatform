// El horario del servidor de datos. Vive en un módulo SIN "use client" para que
// lo puedan leer tanto el navegador como el servidor: es un hecho del producto,
// no una pieza de interfaz.
//
// El servidor de datos NO esta encendido las 24 horas: un programador de AWS lo
// apaga a las 19:00 y lo enciende a las 07:00, de lunes a viernes, y el fin de
// semana lo deja apagado. Es una decision de costo, no una falla, y la consola
// tiene que decirlo asi. Un "502 Bad Gateway" a las 3 de la manana manda a
// alguien a buscar un bug que no existe.
export const HORARIO = "de lunes a viernes, 07:00 a 19:00 (hora de Costa Rica)";

export const MSG_APAGADO =
  `el servidor de datos está apagado. Se enciende ${HORARIO}`;
