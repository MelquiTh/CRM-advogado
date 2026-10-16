import { db } from './db.js';
import { hashPassword } from './auth.js';
import { ingestWhatsApp, getSetting, setSetting } from './services.js';

const TEAM = [
  ['Ana Souza', 'ana@crm.local', '#0ea5e9'],
  ['Bruno Lima', 'bruno@crm.local', '#8b5cf6'],
  ['Carla Mendes', 'carla@crm.local', '#f59e0b'],
  ['Diego Alves', 'diego@crm.local', '#ec4899'],
  ['Elisa Rocha', 'elisa@crm.local', '#14b8a6'],
];

const CHATS = [
  ['5561991110001', 'Marina Costa', 0, [
    ['in', 'Oi! Vi o anúncio de vocês, ainda tem vaga para a turma de março?'],
    ['out', 'Olá, Marina! Temos sim 😊 Posso te passar os valores e horários?'],
    ['in', 'Pode sim, por favor. Tenho interesse no período da manhã.'],
  ]],
  ['5561991110002', 'Roberto Nunes', 0, [
    ['in', 'Bom dia, preciso da segunda via do boleto.'],
    ['out', 'Bom dia, Roberto! Já estou gerando, só um instante.'],
    ['in', 'Obrigado, aguardo.'],
  ]],
  ['5561991110003', 'Patrícia Gomes', 1, [
    ['in', 'Olá, gostaria de remarcar a reunião de quinta.'],
    ['out', 'Claro, Patrícia! Qual o melhor horário para você?'],
    ['in', 'Sexta às 15h seria ótimo.'],
    ['out', 'Perfeito, confirmado para sexta às 15h ✅'],
  ]],
  ['5561991110004', 'Lucas Ferreira', 1, [
    ['in', 'Vocês fazem entrega em Taguatinga?'],
  ]],
  ['5561991110005', 'Fernanda Dias', 2, [
    ['in', 'Boa tarde! Recebi o orçamento, mas queria negociar o valor.'],
    ['out', 'Boa tarde, Fernanda! Vamos ver o que conseguimos. Qual valor você tem em mente?'],
  ]],
  ['5561991110006', 'Thiago Barros', 3, [
    ['in', 'Meu pedido ainda não chegou, pode verificar?'],
    ['out', 'Já estou consultando o rastreio, Thiago.'],
    ['in', 'Ok, obrigado!'],
  ]],
  ['5561991110007', 'Juliana Prado', 4, [
    ['in', 'Olá! Como faço para contratar o plano anual?'],
    ['out', 'Oi, Juliana! Te envio o passo a passo agora mesmo.'],
  ]],
  ['5561991110008', null, null, [
    ['in', 'Oi, tudo bem? Queria saber mais sobre os serviços.'],
  ]],
];

export function seedDemo() {
  if (getSetting('demo_seeded')) return;
  const ins = db.prepare('INSERT INTO users(name,email,password_hash,role,color,active,created_at) VALUES(?,?,?,?,?,1,?)');
  const ids = TEAM.map(([n, e, c]) => Number(ins.run(n, e, hashPassword('demo123'), 'agent', c, Date.now()).lastInsertRowid));

  const base = Date.now() - 3 * 3600 * 1000;
  let t = 0;
  for (const [phone, name, ownerIdx, msgs] of CHATS) {
    const jid = `${phone}@s.whatsapp.net`;
    for (const [dir, body] of msgs) {
      t += 4 * 60 * 1000;
      ingestWhatsApp({
        jid, phone, pushName: name || undefined, waId: `SEED-${phone}-${t}`,
        fromMe: dir === 'out', type: 'text', body, timestamp: base + t,
      });
    }
    const c = db.prepare('SELECT c.id FROM conversations c JOIN contacts k ON k.id=c.contact_id WHERE k.jid=?').get(jid);
    db.prepare('UPDATE conversations SET assigned_to=?, unread=? WHERE id=?')
      .run(ownerIdx == null ? null : ids[ownerIdx], msgs.at(-1)[0] === 'in' ? 1 : 0, c.id);
  }
  setSetting('demo_seeded', '1');
}
