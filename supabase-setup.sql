-- Каталог игры «Угадай, кто ты»: темы и карточки.
-- Запустить один раз: Supabase → SQL Editor → вставить весь скрипт → Run.
-- Повторный запуск безопасен: уже существующие темы и карточки не дублируются.
--
-- Как добавлять своё потом: Supabase → Table Editor → таблица themes или cards → Insert row.
--   themes: id (латиницей, например "anime"), name (название для игроков), sort (порядок в списке).
--   cards:  theme_id (id темы), name (имя персонажа), source (то, что пишется в скобках), id не заполнять.

create table if not exists public.themes (
  id   text primary key,
  name text not null,
  sort int  not null default 0
);

create table if not exists public.cards (
  id       bigint generated always as identity primary key,
  theme_id text not null references public.themes(id) on delete cascade,
  name     text not null unique,   -- один и тот же персонаж не может быть дважды, даже в разных темах
  source   text not null
);

-- Читать каталог может любой игрок (публичный ключ), менять только владелец проекта.
alter table public.themes enable row level security;
alter table public.cards  enable row level security;
drop policy if exists "themes: read for all" on public.themes;
drop policy if exists "cards: read for all"  on public.cards;
create policy "themes: read for all" on public.themes for select using (true);
create policy "cards: read for all"  on public.cards  for select using (true);
grant select on public.themes, public.cards to anon, authenticated;

insert into public.themes (id, name, sort) values
  ('films', 'Фильмы', 1),
  ('cartoons', 'Мультфильмы', 2),
  ('games', 'Игры', 3)
on conflict (id) do nothing;

insert into public.cards (theme_id, name, source) values
  ('films', 'Дарт Вейдер', 'Звёздные войны'),
  ('films', 'Терминатор', 'Терминатор'),
  ('films', 'Джокер', 'Тёмный рыцарь'),
  ('films', 'Форрест Гамп', 'Форрест Гамп'),
  ('films', 'Джек Воробей', 'Пираты Карибского моря'),
  ('films', 'Гарри Поттер', 'Гарри Поттер'),
  ('films', 'Нео', 'Матрица'),
  ('films', 'Тони Старк', 'Мстители'),
  ('films', 'Голлум', 'Властелин колец'),
  ('films', 'Леон', 'Леон'),
  ('cartoons', 'Симба', 'Король Лев'),
  ('cartoons', 'Шрек', 'Шрек'),
  ('cartoons', 'Винни-Пух', 'Винни-Пух'),
  ('cartoons', 'Микки Маус', 'Микки Маус'),
  ('cartoons', 'Губка Боб', 'Губка Боб Квадратные Штаны'),
  ('cartoons', 'Чебурашка', 'Чебурашка и крокодил Гена'),
  ('cartoons', 'Волк', 'Ну, погоди!'),
  ('cartoons', 'Том', 'Том и Джерри'),
  ('cartoons', 'Эльза', 'Холодное сердце'),
  ('cartoons', 'Лунтик', 'Лунтик'),
  ('games', 'Марио', 'Super Mario'),
  ('games', 'Соник', 'Sonic the Hedgehog'),
  ('games', 'Лара Крофт', 'Tomb Raider'),
  ('games', 'Пикачу', 'Pokémon'),
  ('games', 'Стив', 'Minecraft'),
  ('games', 'Кратос', 'God of War'),
  ('games', 'Линк', 'The Legend of Zelda'),
  ('games', 'Пакман', 'Pac-Man'),
  ('games', 'Геральт из Ривии', 'Ведьмак'),
  ('games', 'Мастер Чиф', 'Halo')
on conflict (name) do nothing;
