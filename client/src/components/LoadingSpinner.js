import React from 'react';
import { Spin } from 'antd';
import styled from 'styled-components';

const SpinnerContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: ${props => props.height || '200px'};
  width: 100%;
`;

const LoadingSpinner = ({ height, size = 'large' }) => {
  return (
    <SpinnerContainer height={height}>
      <Spin size={size} />
    </SpinnerContainer>
  );
};

export default LoadingSpinner;