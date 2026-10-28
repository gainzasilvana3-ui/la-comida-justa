-- Licencias creadas solas por el aviso de venta de Impultienda.
-- order_id: id de la orden en Impultienda (evita crear dos licencias por la misma venta).
-- claim_hash: HMAC de "mail|número de pedido", con el que el comprador activa sin código.
-- Como el resto de la base, no se guarda el mail en texto.

ALTER TABLE licenses ADD COLUMN order_id TEXT;
ALTER TABLE licenses ADD COLUMN claim_hash TEXT;
CREATE UNIQUE INDEX licenses_order ON licenses (order_id);
CREATE UNIQUE INDEX licenses_claim ON licenses (claim_hash);
