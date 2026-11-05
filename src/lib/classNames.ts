export type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | { [className: string]: unknown }
  | readonly ClassValue[];

/** Join conditional class names without changing their order or resolving utilities. */
export function classNames(...values: ClassValue[]): string {
  return joinValues(values);
}

function joinValues(values: readonly ClassValue[]): string {
  let names = "";
  for (let index = 0; index < values.length; index++) {
    const value = values[index];
    if (!value) continue;
    if (typeof value === "string" || typeof value === "number") {
      if (names) names += " ";
      names += value;
      continue;
    }
    let next = "";
    if (Array.isArray(value)) {
      next = joinValues(value);
    } else if (typeof value === "object") {
      for (const name in value) {
        if (value[name]) {
          if (next) next += " ";
          next += name;
        }
      }
    }
    if (next) {
      if (names) names += " ";
      names += next;
    }
  }
  return names;
}
