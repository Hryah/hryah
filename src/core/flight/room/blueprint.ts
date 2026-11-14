import data from '../../../data/flight-room.json';
import type { RoomBlueprint, RoomObstacle } from './types';

function obstacleKind(kind: string): RoomObstacle['kind'] {
  if (kind === 'cargo' || kind === 'console') return kind;
  throw new Error(`Unknown room obstacle kind: ${kind}`);
}

export const ROOM_BLUEPRINT: RoomBlueprint = {
  ...data,
  obstacles: data.obstacles.map((obstacle) => ({ ...obstacle, kind: obstacleKind(obstacle.kind) })),
};
