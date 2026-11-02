-- day2day · envío de avisos cada minuto desde la propia base de datos
--
-- pg_cron llama a la Edge Function `push` (ruta /send) con la clave pública del
-- proyecto. No hace falta ningún secreto: /send es idempotente y solo entrega
-- lo que ya toca, así que una llamada de más no produce avisos de más.
-- Se aplica con `supabase db push`, igual que el resto de migraciones.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.push_send_tick()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url     := 'https://sphoivppcixvqxlbjqed.supabase.co/functions/v1/push/send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',        'sb_publishable_ydvRM0E_xbGboEZlHRJmCg_0xVhLzUF',
      'Authorization', 'Bearer sb_publishable_ydvRM0E_xbGboEZlHRJmCg_0xVhLzUF'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
end $$;

-- Nadie más que el cron debe poder invocarla.
revoke all on function public.push_send_tick() from public, anon, authenticated;

-- Cada minuto. Si ya existe, se reemplaza.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'day2day-push-send') then
    perform cron.unschedule('day2day-push-send');
  end if;
  perform cron.schedule('day2day-push-send', '* * * * *', 'select public.push_send_tick()');
end $$;

-- Para revisar: select * from cron.job_run_details order by start_time desc limit 20;
