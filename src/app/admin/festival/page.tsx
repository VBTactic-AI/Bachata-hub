export default function FestivalAdminPage() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="m-0 font-night text-xl font-extrabold text-night-text sm:text-2xl">Фестивали</h1>
      <div className="rounded-app border border-admin-border bg-admin-card p-5">
        <p className="m-0 text-night-text">🟢 Доступ одобрен.</p>
        <p className="m-0 mt-2 text-sm text-admin-muted">
          Система ведения фестивалей (программа, workshops, parties, регистрация) пока в разработке. Как только она
          появится — вы увидите её здесь, без повторной заявки.
        </p>
      </div>
    </div>
  );
}
