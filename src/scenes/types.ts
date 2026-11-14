// types.ts — інтерфейс сцени. Після етапу 0 міняється лише через Олексія.
import type { Stage } from '../render/stage';

export interface Scene<View> {
  /** Створити всі об'єкти й матеріали один раз. */
  mount(stage: Stage): void;
  /** Щокадру: плавно наблизити картинку до виду й додати власний рух. Нових об'єктів не створює. */
  update(view: View, dtS: number, timeS: number): void;
  /** Прибрати за собою: вийняти об'єкти зі сцени, звільнити геометрії, матеріали, текстури. */
  dispose(): void;
}
