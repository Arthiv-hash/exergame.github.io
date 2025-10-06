# gesture_recognizer.py
import math

class GestureRecognizer:
    """
    Recognizes gestures from hand landmarks (MediaPipe).
    """

    def __init__(self):
        pass

    def _is_open(self, landmarks, tip, pip):
        # finger is open if tip is above pip in y-coordinates
        return landmarks[tip].y < landmarks[pip].y - 0.02

    def recognize(self, landmarks) -> str:
        if not landmarks:
            return "NONE"

        index_open = self._is_open(landmarks, 8, 6)
        middle_open = self._is_open(landmarks, 12, 10)
        ring_open = self._is_open(landmarks, 16, 14)
        pinky_open = self._is_open(landmarks, 20, 18)

        if index_open and not middle_open and not ring_open and not pinky_open:
            return "INDEX_UP"
        if not index_open and middle_open and not ring_open and not pinky_open:
            return "MIDDLE_UP"
        if index_open and middle_open and not ring_open and not pinky_open:
            return "INDEX_MIDDLE_UP"
        if index_open and middle_open and ring_open and pinky_open:
            return "PALM"
        if not index_open and not middle_open and not ring_open and not pinky_open:
            return "FIST"

        return "NONE"
