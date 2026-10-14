export function deleteFloorRoom(draft, roomId, targetRoom) {
  const remaining = Object.keys(draft.positions).filter(key => key !== roomId);
  if (!Object.hasOwn(draft.positions, roomId)) throw new Error('Зал не найден.');
  if (!remaining.length) throw new Error('Добавьте другой зал перед удалением последнего.');
  if (!remaining.includes(targetRoom)) throw new Error('Выберите оставшийся зал.');
  const next = structuredClone(draft);
  for (const collection of ['positions','rooms','scenes','backgrounds']) delete next[collection]?.[roomId];
  for (const collection of ['bookings','waitlist']) {
    next[collection] = (next[collection] || []).map(record => (record.room || 'main') === roomId
      ? {...record, room: targetRoom, table: ''} : record);
  }
  next.blocked = (next.blocked || []).filter(key => !key.startsWith(roomId + ':'));
  next.servers = (next.servers || []).map(server => ({...server, tables:(server.tables || []).filter(key => !String(key).startsWith(roomId + ':'))}));
  next.room = targetRoom;
  return next;
}
