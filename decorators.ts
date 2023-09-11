export function Command(name: string): MethodDecorator {
  return (target, _propertyKey, { value }) => {
    const count = Reflect.getMetadata(`total`, target) || 0;
    if (Reflect.getMetadata(`command:${name}`, target) !== undefined) {
      throw new Error(`Command ${name} already registered`);
    }
    console.log(
      `%c%s %c/${name}`,
      "color: magenta;",
      "==>",
      "color: lime; font-weight: bold",
    );
    Reflect.defineMetadata(`command:${name}`, value, target);
    Reflect.defineMetadata(`total`, count + 1, target);
  };
}
