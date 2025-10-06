# main.py
import cv2
import mediapipe as mp
import time
from gesture_recognizer import GestureRecognizer
from gesture_mapper import GestureMapper
import pyautogui  # to simulate keyboard presses

# Mediapipe setup
mp_hands = mp.solutions.hands
mp_drawing = mp.solutions.drawing_utils

recognizer = GestureRecognizer()
mapper = GestureMapper()

cap = cv2.VideoCapture(0)

with mp_hands.Hands(
    max_num_hands=1,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.6
) as hands:

    last_gesture = "NONE"
    gesture_start = 0
    HOLD_TIME = 3  # seconds

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break

        # Flip for mirror view
        frame = cv2.flip(frame, 1)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = hands.process(rgb)

        gesture = "NONE"
        if results.multi_hand_landmarks:
            for hand_landmarks in results.multi_hand_landmarks:
                mp_drawing.draw_landmarks(frame, hand_landmarks, mp_hands.HAND_CONNECTIONS)
                gesture = recognizer.recognize(hand_landmarks.landmark)

        mapped = mapper.map(gesture)

        # Hold gesture for HOLD_TIME seconds before sending
        if mapped != last_gesture:
            last_gesture = mapped
            gesture_start = time.time()
        else:
            if mapped != "NONE" and (time.time() - gesture_start) >= HOLD_TIME:
                # Send mapped command as a simulated keypress
                if mapped == "UP":
                    pyautogui.press("arrowup")
                elif mapped == "DOWN":
                    pyautogui.press("arrowdown")
                elif mapped == "LEFT":
                    pyautogui.press("arrowleft")
                elif mapped == "RIGHT":
                    pyautogui.press("arrowright")
                elif mapped == "FIRE":
                    pyautogui.press("space")

                print(f"✅ Gesture executed: {mapped}")
                gesture_start = time.time()  # reset so it doesn’t spam

        cv2.imshow("Gesture Control", frame)
        if cv2.waitKey(5) & 0xFF == 27:
            break

cap.release()
cv2.destroyAllWindows()
