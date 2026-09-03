// Доменные ошибки движка соревнований (CLAUDE.md §46): пользователь видит
// понятное русское сообщение, техническая причина уходит только в лог/cause.
export class DomainError extends Error {
  constructor(
    public readonly userMessage: string,
    options?: { cause?: unknown }
  ) {
    super(userMessage, options);
    this.name = new.target.name;
  }
}

export class AuthenticationRequiredError extends DomainError {
  constructor() {
    super("Нужно войти в систему, чтобы выполнить это действие.");
  }
}

export class PermissionDeniedError extends DomainError {
  constructor(permission: string) {
    super("У вас нет прав для выполнения этого действия.", { cause: { permission } });
  }
}

export class NotCompetitionMemberError extends DomainError {
  constructor() {
    super("Вы не назначены на это соревнование.");
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(entity: string, from: string, to: string) {
    super(`Недопустимый переход состояния: ${entity} нельзя перевести из "${from}" в "${to}".`, {
      cause: { entity, from, to },
    });
  }
}

export class ConcurrentModificationError extends DomainError {
  constructor(entity: string) {
    super(
      `Не удалось выполнить действие: ${entity} уже был изменён кем-то другим. Обновите страницу и попробуйте ещё раз.`,
      { cause: { entity } }
    );
  }
}

export class ValidationFailedError extends DomainError {
  constructor(message: string) {
    super(message);
  }
}

export class RegistrationNotOpenError extends DomainError {
  constructor() {
    super("Регистрация на это соревнование сейчас закрыта.");
  }
}

export class AlreadyRegisteredError extends DomainError {
  constructor() {
    super("Этот участник уже зарегистрирован в этом дивизионе.");
  }
}

export class NoDancerProfileError extends DomainError {
  constructor() {
    super("Чтобы зарегистрироваться на конкурс, сначала заполните профиль танцора.");
  }
}
