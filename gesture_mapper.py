# gesture_mapper.py
class GestureMapper:
    """
    Maps raw gesture names to directions understood by the maze game.
    """
    def __init__(self):
        self.mapping = {
            "INDEX_UP": "UP",
            "MIDDLE_UP": "DOWN",
            "FIST": "LEFT",
            "INDEX_MIDDLE_UP": "RIGHT",
            "PALM": "FIRE"
        }

    def map(self, gesture_name: str) -> str:
        return self.mapping.get(gesture_name, "NONE")
