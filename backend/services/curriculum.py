MODULES = {
    1: {
        "title": "Variables and Print",
        "topics": [
            "What is a variable",
            "Naming rules for variables",
            "The print function",
            "String and number variables"
        ]
    },
    2: {
        "title": "Data Types",
        "topics": [
            "Integers",
            "Floats",
            "Strings",
            "Booleans",
            "The type function"
        ]
    },
    3: {
        "title": "Conditionals",
        "topics": [
            "if statement",
            "else clause",
            "elif clause",
            "Comparison operators",
            "Nested conditions"
        ]
    },
    4: {
        "title": "Loops",
        "topics": [
            "for loop",
            "while loop",
            "range function",
            "break and continue",
            "Looping through a list"
        ]
    },
    5: {
        "title": "Functions",
        "topics": [
            "Defining a function with def",
            "Parameters",
            "Return values",
            "Calling a function",
            "Default parameters"
        ]
    }
}


def get_module(module_id: int) -> dict:
    return MODULES.get(module_id, MODULES[1])
