import { supabase } from '../src/db/client';

async function listUsers() {
  const { data: payUsers } = await supabase.from('payments').select('telegram_user_id');
  const { data: purUsers } = await supabase.from('purchases').select('telegram_user_id, username, first_name');
  
  const userMap = new Map<number, { id: number; username: string | null; first_name: string | null }>();
  
  purUsers?.forEach(u => {
    userMap.set(Number(u.telegram_user_id), {
      id: Number(u.telegram_user_id),
      username: u.username,
      first_name: u.first_name
    });
  });

  payUsers?.forEach(u => {
    const id = Number(u.telegram_user_id);
    if (!userMap.has(id)) {
      userMap.set(id, { id, username: null, first_name: null });
    }
  });

  console.log('Unique users count:', userMap.size);
  console.log('Users list:', Array.from(userMap.values()));
}

listUsers().catch(console.error);
