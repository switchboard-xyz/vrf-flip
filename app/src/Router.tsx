import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { InternalLinks } from './util';
import HomePage from './views/HomePage';

const Router: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />

      <Route path="*" element={<Navigate to={InternalLinks.Home} replace={true} />} />
    </Routes>
  );
};

export default Router;
