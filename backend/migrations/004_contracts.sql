CREATE TABLE IF NOT EXISTS contracts (
  id VARCHAR(36) PRIMARY KEY,
  process_name VARCHAR(255) NOT NULL,
  object_description TEXT NOT NULL,
  process_number VARCHAR(120) NOT NULL,
  contract_value DECIMAL(15,2) NOT NULL,
  due_date DATE NOT NULL,
  fiscal_effective VARCHAR(255) NOT NULL,
  fiscal_substitute VARCHAR(255) NULL,
  modality VARCHAR(120) NOT NULL,
  law_type ENUM('old', 'new') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_contracts_due_date (due_date),
  INDEX idx_contracts_modality (modality),
  INDEX idx_contracts_process_number (process_number)
);
