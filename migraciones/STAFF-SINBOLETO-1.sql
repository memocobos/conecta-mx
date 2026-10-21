-- STAFF-SINBOLETO-1 · 20-oct-2026 · YA CORRIDO (Jane)
-- Palabra de Memo: «algunos coordis pueden ir a un viaje y no usar boleto (Xamel
-- va a Tiësto y Bad Gyal el mismo día, va a Tiësto) … opción de no asignarles
-- boleto en algunos eventos». Marca explícita en su fila de staff: zona en NULL
-- (no descuenta inventario) y la alarma «no tiene boleto» se calla.
-- Tabla existente: no requiere GRANT nuevo (regla del 30-oct aplica a tablas nuevas).
alter table viajeros_evento add column if not exists sin_boleto boolean not null default false;
comment on column viajeros_evento.sin_boleto is 'STAFF-SINBOLETO-1 (20-oct-2026): staff/coordi que va al tour pero NO usa boleto en este evento. Zona en NULL a propósito; apaga la alarma «sin boleto».';
