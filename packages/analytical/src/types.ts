declare module 'kire' {
    export interface Position {
        line: number;
        column: number;
        offset: number;
    }

    export interface NodeLocation {
        source: string;
        start: Position;
        end: Position;
    }

    export interface Node {
        loc?: NodeLocation;
    }
}
