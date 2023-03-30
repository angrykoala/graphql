export type SelectionSetFieldRegexGroups = {
    fieldName: string;
    isConnection: boolean;
};

const SelectionSetFieldRegex = /(?<fieldName>[_A-Za-z]\w*?)(?<isConnection>Connection)?$/;

export function parseSelectionSetField(field: string): SelectionSetFieldRegexGroups {
    const match = SelectionSetFieldRegex.exec(field);
    const matchGroups = match?.groups as {
        fieldName: string;
        isConnection?: string;
    };
    return {
        fieldName: matchGroups.fieldName,
        isConnection: Boolean(matchGroups.isConnection),
    };
}
