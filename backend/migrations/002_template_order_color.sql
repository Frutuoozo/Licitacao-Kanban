-- 1) Adiciona colunas de ordenação e cor no cadastro de modelos
ALTER TABLE templates
  ADD COLUMN sort_order INT NOT NULL DEFAULT 0,
  ADD COLUMN type_color VARCHAR(32) NULL;

-- 2) (Opcional) Atualiza dados existentes para preencher com valores default
UPDATE templates SET sort_order = 0 WHERE sort_order IS NULL;

-- 3) (Opcional) Adiciona restrição de não-nulo se desejar
-- ALTER TABLE templates ALTER COLUMN sort_order SET NOT NULL;

-- 4) Cria índices para melhorar performance em filtros e ordenações
CREATE INDEX idx_templates_order ON templates(sort_order);
CREATE INDEX idx_templates_type_color ON templates(type_color);