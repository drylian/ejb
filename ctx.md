Estou desenvolvendo uma nova api de atualização, na qual vai adicionar novos recursos ao sistema:


1 - O Ejbclient vai ser uma api do ejb reativa granular, que interage com o backend, deixando mais dinamico com a necessidade de poucos
2 - A separação dos arquivos, {se,cl}-<name>.[hash:8].js, <name>.[hash:8].css, O EjbBuilder, ja trata até certo ponto isso, permitindo criar artifacts desses arquivos.
3 - Adicionar novos directives como por exemplo @assets() // serve para adicionar o css e js precarregados dos codigos que são mostrados no frontend
4 - Scope local e global, para css, o scope é presente nos directive @css <csscodes> @end sendo local (o css carregado aqui funciona apenas para o artifact local), @css('global') <csscodes> @end string é um scope com referencia, e 'global' é o scope para css geral
5 - Client Side, o ejb viza ser similar ao blade, mais ter sua propria forma de tratar informações, ele viza ter o client dele granular, permtindo que usuarios consigam usar o ejb sem a necessidade de modulos externos para criar tabelas etc,


exemplo de Client Side code:
main.ejb
@js('client')
	const render = @client.load('referencia'); // $ejb.renderload('referencia')
	const search = @element('search'); // $ejb.element('search')
	@effect([search], 3000) // $ejb.effect(() => {}, [search], debounce);
		const users = @fetch('/api/users', { params: { query:search.value }});
		render({ users });
	@end
@end

@client('referencia', { users:[] propriedades }) // o ejb possue o ejbbuilder que compila artifacts, que permite alterar o artifact que ta sendo executado, o @client basicamente faz isso, armazenando todo codigo chamado aqui no client side
	<!-- Todo codigo aqui dentro representa o client side -->
	<input @ref('search') />
	@for(user in users)
		<li>{{ user }}</li>
	@end
@end

gera:

cl-main.[hash:8].js
$ejb.js(async ($ejb) => {
	const render = $ejb.renderload('referencia');
	const search = $ejb.element('search');
	$ejb.effect(async () => {
		const users = await $ejb.fetch('/api/users', { params: { query:search.value }});
		render({ users });
	}, [search], 3000)
})

$ejb.load('referencia', async ($ejb, { users }) => {
	$ejb.res += `<!-- Todo codigo aqui dentro representa o client side -->`;
	$ejb.res += `<input ejb:ref='search' />`;
	for(let user of users) {
		$ejb.res += `<li>`;
		$ejb.res += user;
		$ejb.res += `</li>`;
	}
})


6 - Virtual Paths, como o ejb vai gerar arquivos para ambiente de produção(o js, css e outros modelos ficam em arquivo separados), para fins de desenvolvimento o modo dev colocará os arquivos diretametne no HTML, exemplo do cl-main.[hash:8].js

<style efl='main.ejb'>
 //@css <path>:line:char
	<...>
 //@end <path>:line:char
</style>
<script efl='main.ejb'>

//@js <path>:line:char
$ejb.js(async ($ejb) => {
	const render = $ejb.renderload('referencia');
	const search = $ejb.element('search');
	$ejb.effect(async () => {
		const users = await $ejb.fetch('/api/users', { params: { query:search.value }});
		render({ users });
	}, [search], 3000)
})
//@end <path>:line:char

//@client('referencia', { users:[] propriedades }) <path>:line:char
$ejb.load('referencia', async ($ejb, { users }) => {
	$ejb.res += `<!-- Todo codigo aqui dentro representa o client side -->`;
	$ejb.res += `<input ejb:ref='search' />`;
	for(let user of users) {
		$ejb.res += `<li>`;
		$ejb.res += user;
		$ejb.res += `</li>`;
	}
})
//@end <path>:line:char
</script>