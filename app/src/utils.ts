export const omitFp =
  <T extends object>(...keys: Array<keyof T>) =>
  (obj: T): T => {
    const newObject = { ...obj };

    for (const key of keys) {
      delete newObject[key];
    }

    return newObject;
  };

export const pickFp =
  <T extends object>(...keys: Array<keyof T>) =>
  (obj: T): T => {
    const newObject = {} as T;

    for (const key of keys) {
      newObject[key] = obj[key];
    }

    return newObject;
  };
