import { Kire } from 'kire';
import ClientPlugin from './src/index';
import { writeFileSync } from 'fs';
import { join } from 'path';

const kire = new Kire();
kire.plugin(ClientPlugin);
const template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kire Client Example</title>
    @kireclient
    <style>
        body { font-family: sans-serif; padding: 2rem; }
        .card { border: 1px solid #ccc; padding: 1rem; border-radius: 8px; max-width: 300px; margin-top: 1rem; }
        button { background: #007bff; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <h1>Kire Client Side Interactivity</h1>
    
    <div @ref('counter-app') class="card">
        <!-- The client directive mounts the logic here -->
        @client('counter-app', { count: 0 })
            <h2>Counter: {{ it.count }}</h2>
            <p>Double: {{ it.double() }}</p>
            <!-- AQUI: sem {{ }}, deixamos it.increment() literal -->
            <button onclick="it.increment()">Increment</button>
        @end
    </div>

    @reactive('counter-app')
        // This code runs on the client
        let count = $state(0);
        
        // Derived state (computed)
        let double = $state(() => count() * 2);

        const increment = () => {
            console.log('Incrementing', count());
            count(prev => prev + 1);
        };

        return {
            count,
            double,
            increment
        };
    @end

    <div @ref('todo-app') class="card">
        @client('todo-app', { todos: [], text: '' })
            <h2>Todos</h2>
            <!-- value ainda pode usar {{ }}, é só renderização -->
            <input
                type="text"
                value="{{ it.text }}"
                <!-- evento agora é it.text(this.value) direto -->
                oninput="it.text(this.value)"
                placeholder="Add todo..."
            />
            <button onclick="it.add()">Add</button>
            <ul>
                @for(todo of it.todos)
                     <li>
                         {{ todo }}
                         <button
                             onclick="it.remove(todo)"
                             style="font-size:0.8em; padding:2px 5px; margin-left:5px; background:red;"
                         >
                             x
                         </button>
                     </li>
                @end
            </ul>
        @end
    </div>

    @reactive('todo-app')
        let todos = $state(['Buy Milk', 'Walk Dog']);
        let text = $state('');

        const add = () => {
            if (!text()) return;
            todos(prev => [...prev, text()]);
            text('');
        };

        const remove = (item) => {
             todos(prev => prev.filter(t => t !== item));
        };

        return {
            todos,
            text,
            add,
            remove
        };
    @end

</body>
</html>
`;

(async () => {
    console.log('Compiling example...');
    try {
        const html = await kire.render(template);
        const outputPath = join(__dirname, 'example_output.html');
        writeFileSync(outputPath, html);
        console.log(`Successfully generated example at: ${outputPath}`);
    } catch (e) {
        console.error('Error compiling example:', e);
    }
})();
