export class Logger {
  static _enabled = true;

  static enable() {
    Logger._enabled = true;
  }

  static disable() {
    Logger._enabled = false;
  }

  static log(msg) {
    if (Logger._enabled) console.log(msg);
  }

  static warn(msg) {
    if (Logger._enabled) console.warn(msg);
  }

  static error(msg, err) {
    if (Logger._enabled) console.error(msg, err);
  }
}
