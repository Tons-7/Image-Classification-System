A full end-to-end **image classification system** that combines machine learning, backend API, and a frontend interface.

## System Overview

The system is composed of three main parts:

- The **model** handles training, prediction, and retraining
- The **backend** exposes inference endpoints
- The **frontend** provides a simple UI to interact with the system

## Security Notes

- No API keys or secrets are stored in this repository
- Environment variables are loaded from `.env` files
- All sensitive files are excluded via `.gitignore`
- For the email functionality, you will have to place your own email and password in the backend

## Purpose of This Project

This project was built to demonstrate:
- Practical image classification
- ML system design beyond notebooks
- Integration between ML, backend APIs, and frontend UI
- Clean project structure and production-aware practices

## Notes

This repository focuses on **engineering and integration**, not only model accuracy.
It is intended as a **portfolio project** showcasing end-to-end ML system development.
