export function isAdminRole(role) {
  return role === 'admin';
}

export function isEditorOrAdminRole(role) {
  return role === 'admin' || role === 'editor';
}
