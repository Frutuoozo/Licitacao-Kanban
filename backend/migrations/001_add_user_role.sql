-- Execute no MySQL após atualizar o backend (uma vez por banco existente).
-- Novas instalações já podem usar schema.sql atualizado.

ALTER TABLE users
  ADD COLUMN role ENUM('user', 'admin') NOT NULL DEFAULT 'user';

-- Opcional: definir um administrador (troque o nome de usuário):
-- UPDATE users SET role = 'admin' WHERE username = 'seu_usuario';
